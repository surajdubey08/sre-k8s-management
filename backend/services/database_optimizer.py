"""
Database Query Optimization Service
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import pymongo

logger = logging.getLogger(__name__)

class DatabaseOptimizer:
    """Database performance optimization and query analysis"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.query_stats = {}
        self.slow_queries = []
        self.index_suggestions = []
        
    async def analyze_collection_performance(self, collection_name: str) -> Dict[str, Any]:
        """Analyze performance for a specific collection"""
        collection = self.db[collection_name]
        
        # Get collection stats
        stats = await self.db.command("collStats", collection_name)
        
        # Get index information
        indexes = await collection.list_indexes().to_list(length=None)
        
        # Analyze query patterns from profiler data (if enabled)
        profiler_data = await self.get_profiler_data(collection_name)
        
        return {
            "collection": collection_name,
            "document_count": stats.get("count", 0),
            "storage_size": stats.get("storageSize", 0),
            "average_object_size": stats.get("avgObjSize", 0),
            "total_index_size": stats.get("totalIndexSize", 0),
            "indexes": [
                {
                    "name": idx.get("name"),
                    "key": idx.get("key"),
                    "unique": idx.get("unique", False),
                    "sparse": idx.get("sparse", False)
                }
                for idx in indexes
            ],
            "slow_queries": profiler_data.get("slow_queries", []),
            "query_patterns": profiler_data.get("patterns", {}),
            "recommendations": await self.generate_recommendations(collection_name, stats, indexes)
        }
    
    async def get_profiler_data(self, collection_name: str, hours: int = 24) -> Dict[str, Any]:
        """Get profiler data for query analysis"""
        try:
            # Query the profiler collection for slow operations
            since = datetime.now(timezone.utc) - timedelta(hours=hours)
            
            profiler_collection = self.db["system.profile"]
            
            cursor = profiler_collection.find({
                "ns": f"{self.db.name}.{collection_name}",
                "ts": {"$gte": since},
                "millis": {"$gte": 100}  # Queries taking more than 100ms
            }).sort("ts", -1).limit(100)
            
            slow_queries = []
            query_patterns = {}
            
            async for operation in cursor:
                slow_queries.append({
                    "timestamp": operation.get("ts"),
                    "duration_ms": operation.get("millis"),
                    "operation": operation.get("op"),
                    "command": operation.get("command", {}),
                    "execution_stats": operation.get("execStats", {})
                })
                
                # Analyze query patterns
                op_type = operation.get("op", "unknown")
                if op_type not in query_patterns:
                    query_patterns[op_type] = {
                        "count": 0,
                        "total_time": 0,
                        "avg_time": 0
                    }
                
                query_patterns[op_type]["count"] += 1
                query_patterns[op_type]["total_time"] += operation.get("millis", 0)
                query_patterns[op_type]["avg_time"] = (
                    query_patterns[op_type]["total_time"] / 
                    query_patterns[op_type]["count"]
                )
            
            return {
                "slow_queries": slow_queries,
                "patterns": query_patterns
            }
            
        except Exception as e:
            logger.warning(f"Could not retrieve profiler data: {e}")
            return {"slow_queries": [], "patterns": {}}
    
    async def generate_recommendations(self, collection_name: str, stats: Dict, indexes: List) -> List[str]:
        """Generate optimization recommendations"""
        recommendations = []
        
        # Check if collection has basic indexes
        index_names = [idx.get("name") for idx in indexes]
        
        # Recommend indexes based on collection type
        if collection_name == "audit_logs":
            if not any("timestamp" in name for name in index_names):
                recommendations.append("Create index on 'timestamp' field for audit log queries")
            if not any("user" in name for name in index_names):
                recommendations.append("Create index on 'user' field for filtering audit logs by user")
            if not any("operation" in name for name in index_names):
                recommendations.append("Create index on 'operation' field for operation-based filtering")
        
        elif collection_name == "users":
            if not any("username" in name for name in index_names):
                recommendations.append("Create unique index on 'username' field")
            if not any("email" in name for name in index_names):
                recommendations.append("Create unique index on 'email' field")
        
        # Check collection size and suggest partitioning
        if stats.get("count", 0) > 100000:
            recommendations.append("Consider implementing data archiving for old records")
        
        if stats.get("avgObjSize", 0) > 16 * 1024:  # 16KB
            recommendations.append("Consider document size optimization - large documents detected")
        
        # Index efficiency check
        total_size = stats.get("storageSize", 0)
        index_size = stats.get("totalIndexSize", 0)
        
        if index_size > total_size * 0.5:  # Indexes take more than 50% of storage
            recommendations.append("Review index usage - indexes may be over-optimized")
        
        return recommendations
    
    async def create_optimal_indexes(self, collection_name: str) -> List[str]:
        """Create recommended indexes for optimal performance"""
        collection = self.db[collection_name]
        created_indexes = []
        
        try:
            if collection_name == "audit_logs":
                # Compound index for common queries
                await collection.create_index([
                    ("timestamp", pymongo.DESCENDING),
                    ("success", 1),
                    ("user", 1)
                ], name="audit_logs_optimal", background=True)
                created_indexes.append("audit_logs_optimal")
                
                # Index for operation filtering
                await collection.create_index("operation", background=True)
                created_indexes.append("operation_1")
                
            elif collection_name == "users":
                # Unique indexes for authentication
                await collection.create_index("username", unique=True, background=True)
                await collection.create_index("email", unique=True, background=True)
                created_indexes.extend(["username_1", "email_1"])
                
        except Exception as e:
            logger.error(f"Failed to create indexes for {collection_name}: {e}")
        
        return created_indexes
    
    async def optimize_queries(self) -> Dict[str, Any]:
        """Perform comprehensive database optimization"""
        optimization_results = {}
        
        # Get list of all collections
        collection_names = await self.db.list_collection_names()
        
        for collection_name in collection_names:
            if collection_name.startswith("system."):
                continue
                
            try:
                # Analyze collection performance
                analysis = await self.analyze_collection_performance(collection_name)
                
                # Create optimal indexes if needed
                created_indexes = await self.create_optimal_indexes(collection_name)
                
                optimization_results[collection_name] = {
                    "analysis": analysis,
                    "created_indexes": created_indexes,
                    "optimized": True
                }
                
            except Exception as e:
                logger.error(f"Failed to optimize collection {collection_name}: {e}")
                optimization_results[collection_name] = {
                    "error": str(e),
                    "optimized": False
                }
        
        return optimization_results
    
    async def get_database_stats(self) -> Dict[str, Any]:
        """Get comprehensive database statistics"""
        try:
            # Database stats
            db_stats = await self.db.command("dbStats")
            
            # Server status
            server_status = await self.db.command("serverStatus")
            
            return {
                "database": {
                    "name": self.db.name,
                    "collections": db_stats.get("collections", 0),
                    "objects": db_stats.get("objects", 0),
                    "data_size": db_stats.get("dataSize", 0),
                    "storage_size": db_stats.get("storageSize", 0),
                    "index_size": db_stats.get("indexSize", 0),
                    "avg_obj_size": db_stats.get("avgObjSize", 0)
                },
                "connections": {
                    "current": server_status.get("connections", {}).get("current", 0),
                    "available": server_status.get("connections", {}).get("available", 0),
                    "total_created": server_status.get("connections", {}).get("totalCreated", 0)
                },
                "operations": {
                    "insert": server_status.get("opcounters", {}).get("insert", 0),
                    "query": server_status.get("opcounters", {}).get("query", 0),
                    "update": server_status.get("opcounters", {}).get("update", 0),
                    "delete": server_status.get("opcounters", {}).get("delete", 0)
                },
                "memory": {
                    "resident": server_status.get("mem", {}).get("resident", 0),
                    "virtual": server_status.get("mem", {}).get("virtual", 0),
                    "mapped": server_status.get("mem", {}).get("mapped", 0)
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to get database stats: {e}")
            return {"error": str(e)}
    
    async def cleanup_old_data(self, days_to_keep: int = 30) -> Dict[str, Any]:
        """Clean up old audit logs and optimize storage"""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)
        cleanup_results = {}
        
        try:
            # Clean up old audit logs
            audit_collection = self.db["audit_logs"]
            result = await audit_collection.delete_many({
                "timestamp": {"$lt": cutoff_date}
            })
            
            cleanup_results["audit_logs"] = {
                "deleted_count": result.deleted_count,
                "cutoff_date": cutoff_date.isoformat()
            }
            
            # You can add more collections to clean up here
            
        except Exception as e:
            logger.error(f"Failed to cleanup old data: {e}")
            cleanup_results["error"] = str(e)
        
        return cleanup_results
    
    async def enable_profiling(self, level: int = 1, slow_ms: int = 100):
        """Enable database profiling for performance monitoring"""
        try:
            await self.db.command("profile", level, slowms=slow_ms)
            logger.info(f"Database profiling enabled at level {level}")
            return True
        except Exception as e:
            logger.error(f"Failed to enable profiling: {e}")
            return False
    
    async def disable_profiling(self):
        """Disable database profiling"""
        try:
            await self.db.command("profile", 0)
            logger.info("Database profiling disabled")
            return True
        except Exception as e:
            logger.error(f"Failed to disable profiling: {e}")
            return False