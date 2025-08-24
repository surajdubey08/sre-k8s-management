"""
Advanced Caching System for Kubernetes API responses
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List, Set
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib

logger = logging.getLogger(__name__)

class CacheStrategy(Enum):
    NO_CACHE = "no_cache"
    SHORT_TERM = "short_term"  # 30 seconds
    MEDIUM_TERM = "medium_term"  # 2 minutes  
    LONG_TERM = "long_term"  # 5 minutes
    PERSISTENT = "persistent"  # Until invalidated

@dataclass
class CacheEntry:
    key: str
    data: Any
    timestamp: datetime
    ttl_seconds: int
    access_count: int = 0
    last_accessed: Optional[datetime] = None
    tags: Set[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = set()
        if self.last_accessed is None:
            self.last_accessed = self.timestamp

    @property
    def is_expired(self) -> bool:
        if self.ttl_seconds <= 0:  # Persistent cache
            return False
        return (datetime.now(timezone.utc) - self.timestamp).total_seconds() > self.ttl_seconds

    @property
    def age_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.timestamp).total_seconds()

class KubernetesCacheManager:
    """Advanced caching system with TTL, tags, and invalidation strategies"""
    
    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
        self._tag_index: Dict[str, Set[str]] = {}  # tag -> set of cache keys
        self._cleanup_interval = 60  # seconds
        self._max_cache_size = 1000
        self._stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'invalidations': 0
        }
        self._cleanup_task = None
        self._cleanup_started = False

    def _start_cleanup_task(self):
        """Start background cleanup task"""
        if self._cleanup_task is None and not self._cleanup_started:
            try:
                self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
                self._cleanup_started = True
            except RuntimeError:
                # No event loop running, will start later
                pass

    async def _periodic_cleanup(self):
        """Periodic cleanup of expired entries"""
        while True:
            try:
                await asyncio.sleep(self._cleanup_interval)
                await self._cleanup_expired()
                await self._enforce_size_limit()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cache cleanup error: {e}")

    async def _cleanup_expired(self):
        """Remove expired cache entries"""
        expired_keys = []
        
        for key, entry in self._cache.items():
            if entry.is_expired:
                expired_keys.append(key)
        
        for key in expired_keys:
            await self._remove_entry(key)
            self._stats['evictions'] += 1
            
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    async def _enforce_size_limit(self):
        """Enforce maximum cache size by removing least recently used entries"""
        if len(self._cache) <= self._max_cache_size:
            return
            
        # Sort by last accessed time and remove oldest entries
        sorted_entries = sorted(
            self._cache.items(), 
            key=lambda x: x[1].last_accessed or x[1].timestamp
        )
        
        entries_to_remove = len(self._cache) - self._max_cache_size
        
        for key, _ in sorted_entries[:entries_to_remove]:
            await self._remove_entry(key)
            self._stats['evictions'] += 1

    async def _remove_entry(self, key: str):
        """Remove cache entry and update tag index"""
        if key in self._cache:
            entry = self._cache[key]
            
            # Remove from tag index
            for tag in entry.tags:
                if tag in self._tag_index:
                    self._tag_index[tag].discard(key)
                    if not self._tag_index[tag]:
                        del self._tag_index[tag]
            
            del self._cache[key]

    def _generate_cache_key(self, prefix: str, **kwargs) -> str:
        """Generate cache key from prefix and parameters"""
        # Sort kwargs for consistent key generation
        sorted_params = sorted(kwargs.items())
        param_str = "&".join(f"{k}={v}" for k, v in sorted_params if v is not None)
        
        if param_str:
            key_str = f"{prefix}?{param_str}"
        else:
            key_str = prefix
            
        # Use hash for very long keys
        if len(key_str) > 200:
            return f"{prefix}:{hashlib.sha256(key_str.encode()).hexdigest()[:16]}"
        
        return key_str

    def _get_ttl_seconds(self, strategy: CacheStrategy) -> int:
        """Get TTL in seconds for cache strategy"""
        ttl_mapping = {
            CacheStrategy.NO_CACHE: 0,
            CacheStrategy.SHORT_TERM: 30,
            CacheStrategy.MEDIUM_TERM: 120,
            CacheStrategy.LONG_TERM: 300,
            CacheStrategy.PERSISTENT: -1  # No expiration
        }
        return ttl_mapping.get(strategy, 0)

    def _ensure_cleanup_task(self):
        """Ensure cleanup task is running"""
        if not self._cleanup_started:
            try:
                if self._cleanup_task is None:
                    self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
                    self._cleanup_started = True
            except RuntimeError:
                # No event loop running yet
                pass

    async def get(self, key: str) -> Optional[Any]:
        """Get cached data"""
        self._ensure_cleanup_task()
        
        if key not in self._cache:
            self._stats['misses'] += 1
            return None
            
        entry = self._cache[key]
        
        if entry.is_expired:
            await self._remove_entry(key)
            self._stats['misses'] += 1
            return None
        
        # Update access statistics
        entry.access_count += 1
        entry.last_accessed = datetime.now(timezone.utc)
        
        self._stats['hits'] += 1
        return entry.data

    async def set(self, 
                  key: str, 
                  data: Any, 
                  strategy: CacheStrategy = CacheStrategy.MEDIUM_TERM,
                  tags: Optional[Set[str]] = None) -> bool:
        """Set cached data with strategy and tags"""
        
        if strategy == CacheStrategy.NO_CACHE:
            return False
            
        ttl_seconds = self._get_ttl_seconds(strategy)
        tags = tags or set()
        
        # Remove existing entry if present
        if key in self._cache:
            await self._remove_entry(key)
        
        # Create new entry
        entry = CacheEntry(
            key=key,
            data=data,
            timestamp=datetime.now(timezone.utc),
            ttl_seconds=ttl_seconds,
            tags=tags
        )
        
        self._cache[key] = entry
        
        # Update tag index
        for tag in tags:
            if tag not in self._tag_index:
                self._tag_index[tag] = set()
            self._tag_index[tag].add(key)
        
        return True

    async def invalidate_by_key(self, key: str) -> bool:
        """Invalidate specific cache entry"""
        if key in self._cache:
            await self._remove_entry(key)
            self._stats['invalidations'] += 1
            return True
        return False

    async def invalidate_by_tag(self, tag: str) -> int:
        """Invalidate all entries with specific tag"""
        if tag not in self._tag_index:
            return 0
            
        keys_to_invalidate = list(self._tag_index[tag])
        
        for key in keys_to_invalidate:
            await self._remove_entry(key)
            
        self._stats['invalidations'] += len(keys_to_invalidate)
        return len(keys_to_invalidate)

    async def invalidate_by_pattern(self, pattern: str) -> int:
        """Invalidate entries matching key pattern (simple wildcard support)"""
        keys_to_invalidate = []
        
        if pattern.endswith('*'):
            prefix = pattern[:-1]
            keys_to_invalidate = [key for key in self._cache.keys() if key.startswith(prefix)]
        elif pattern.startswith('*'):
            suffix = pattern[1:]
            keys_to_invalidate = [key for key in self._cache.keys() if key.endswith(suffix)]
        else:
            # Exact match
            if pattern in self._cache:
                keys_to_invalidate = [pattern]
        
        for key in keys_to_invalidate:
            await self._remove_entry(key)
            
        self._stats['invalidations'] += len(keys_to_invalidate)
        return len(keys_to_invalidate)

    async def clear_all(self) -> int:
        """Clear all cache entries"""
        count = len(self._cache)
        self._cache.clear()
        self._tag_index.clear()
        self._stats['invalidations'] += count
        return count

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self._stats['hits'] + self._stats['misses']
        hit_rate = (self._stats['hits'] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'size': len(self._cache),
            'max_size': self._max_cache_size,
            'hits': self._stats['hits'],
            'misses': self._stats['misses'],
            'hit_rate_percent': round(hit_rate, 2),
            'evictions': self._stats['evictions'],
            'invalidations': self._stats['invalidations'],
            'tags_count': len(self._tag_index)
        }

    def get_cache_info(self) -> Dict[str, Any]:
        """Get detailed cache information"""
        entries_info = []
        
        for key, entry in self._cache.items():
            entries_info.append({
                'key': key,
                'size_bytes': len(json.dumps(entry.data, default=str)) if entry.data else 0,
                'age_seconds': entry.age_seconds,
                'ttl_seconds': entry.ttl_seconds,
                'access_count': entry.access_count,
                'tags': list(entry.tags),
                'is_expired': entry.is_expired
            })
        
        return {
            'entries': entries_info,
            'stats': self.get_stats()
        }

    async def shutdown(self):
        """Shutdown cache manager"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        await self.clear_all()

# Kubernetes-specific cache utilities
class KubernetesCache:
    """Kubernetes-specific caching utilities"""
    
    def __init__(self, cache_manager: KubernetesCacheManager):
        self.cache = cache_manager
    
    # Resource caching methods
    async def get_deployments(self, namespace: Optional[str] = None, **kwargs) -> Optional[List[Dict]]:
        key = self.cache._generate_cache_key("deployments", namespace=namespace, **kwargs)
        return await self.cache.get(key)
    
    async def set_deployments(self, deployments: List[Dict], namespace: Optional[str] = None, **kwargs):
        key = self.cache._generate_cache_key("deployments", namespace=namespace, **kwargs)
        tags = {"deployments", f"namespace:{namespace}" if namespace else "all_namespaces"}
        await self.cache.set(key, deployments, CacheStrategy.MEDIUM_TERM, tags)
    
    async def get_daemonsets(self, namespace: Optional[str] = None, **kwargs) -> Optional[List[Dict]]:
        key = self.cache._generate_cache_key("daemonsets", namespace=namespace, **kwargs)
        return await self.cache.get(key)
    
    async def set_daemonsets(self, daemonsets: List[Dict], namespace: Optional[str] = None, **kwargs):
        key = self.cache._generate_cache_key("daemonsets", namespace=namespace, **kwargs)
        tags = {"daemonsets", f"namespace:{namespace}" if namespace else "all_namespaces"}
        await self.cache.set(key, daemonsets, CacheStrategy.MEDIUM_TERM, tags)
    
    async def get_resource_config(self, resource_type: str, namespace: str, name: str) -> Optional[Dict]:
        key = self.cache._generate_cache_key("config", type=resource_type, namespace=namespace, name=name)
        return await self.cache.get(key)
    
    async def set_resource_config(self, config: Dict, resource_type: str, namespace: str, name: str):
        key = self.cache._generate_cache_key("config", type=resource_type, namespace=namespace, name=name)
        tags = {"configurations", f"namespace:{namespace}", f"type:{resource_type}"}
        await self.cache.set(key, config, CacheStrategy.SHORT_TERM, tags)
    
    # Invalidation methods
    async def invalidate_namespace(self, namespace: str) -> int:
        """Invalidate all cache entries for a namespace"""
        return await self.cache.invalidate_by_tag(f"namespace:{namespace}")
    
    async def invalidate_resource_type(self, resource_type: str) -> int:
        """Invalidate all cache entries for a resource type"""
        return await self.cache.invalidate_by_tag(resource_type)
    
    async def invalidate_resource(self, resource_type: str, namespace: str, name: str) -> int:
        """Invalidate cache for specific resource"""
        pattern = f"*type={resource_type}*namespace={namespace}*name={name}*"
        return await self.cache.invalidate_by_pattern(pattern)

# Global cache instance
cache_manager = KubernetesCacheManager()
k8s_cache = KubernetesCache(cache_manager)