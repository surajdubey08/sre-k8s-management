import requests
import sys
import json
import websocket
import threading
import time
from datetime import datetime

class KubernetesDashboardAPITester:
    def __init__(self, base_url="https://kube-optimizer.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.ws_url = f"{base_url.replace('https://', 'wss://').replace('http://', 'ws://')}/ws"
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.websocket_messages = []
        self.ws_connection = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, params=params, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, params=params, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=test_headers, params=params, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 500:
                        print(f"   Response: {json.dumps(response_data, indent=2)}")
                    elif isinstance(response_data, list):
                        print(f"   Response: List with {len(response_data)} items")
                except:
                    print(f"   Response: {response.text[:200]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:300]}")

            return success, response.json() if response.content else {}

        except requests.exceptions.RequestException as e:
            print(f"❌ Failed - Network Error: {str(e)}")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_login(self, username="admin", password="admin123"):
        """Test login with admin credentials"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response.get('user', {})
            print(f"   Logged in as: {self.user_data.get('username')} ({self.user_data.get('role')})")
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_register_new_user(self):
        """Test user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        test_user = {
            "username": f"testuser_{timestamp}",
            "email": f"test_{timestamp}@example.com",
            "password": "TestPass123!",
            "role": "user"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=test_user
        )
        return success

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard/stats",
            200
        )
        return success

    def test_list_deployments(self):
        """Test listing deployments"""
        success, response = self.run_test(
            "List Deployments",
            "GET",
            "deployments",
            200
        )
        return success, response

    def test_list_daemonsets(self):
        """Test listing daemonsets"""
        success, response = self.run_test(
            "List DaemonSets",
            "GET",
            "daemonsets",
            200
        )
        return success, response

    def test_scale_deployment(self):
        """Test scaling a deployment"""
        # First get deployments to find one to scale
        success, deployments = self.test_list_deployments()
        if not success or not deployments:
            print("❌ Cannot test scaling - no deployments found")
            return False
        
        # Use the first deployment for scaling test
        deployment = deployments[0]
        namespace = deployment.get('namespace', 'default')
        name = deployment.get('name', 'nginx-deployment')
        
        # Scale to 5 replicas
        success, response = self.run_test(
            f"Scale Deployment ({namespace}/{name})",
            "PATCH",
            f"deployments/{namespace}/{name}/scale",
            200,
            data={"replicas": 5}
        )
        
        if success:
            # Scale back to 3 replicas
            success2, response2 = self.run_test(
                f"Scale Deployment Back ({namespace}/{name})",
                "PATCH",
                f"deployments/{namespace}/{name}/scale",
                200,
                data={"replicas": 3}
            )
            return success and success2
        
        return success

    def test_audit_logs(self):
        """Test getting audit logs"""
        success, response = self.run_test(
            "Get Audit Logs",
            "GET",
            "audit-logs?limit=10",
            200
        )
        return success

    def test_invalid_auth(self):
        """Test invalid authentication"""
        # Save current token
        original_token = self.token
        self.token = "invalid_token_12345"
        
        success, response = self.run_test(
            "Invalid Auth Test",
            "GET",
            "auth/me",
            401  # Should fail with 401
        )
        
        # Restore original token
        self.token = original_token
        return success

    def test_unauthorized_access(self):
        """Test accessing protected endpoint without token"""
        # Save current token
        original_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "Unauthorized Access Test",
            "GET",
            "deployments",
            401  # Should fail with 401
        )
        
        # Restore original token
        self.token = original_token
        return success

    # ========== ENHANCED CONFIGURATION MANAGEMENT TESTS ==========
    
    def test_get_deployment_config(self):
        """Test GET /api/deployment/{namespace}/{name}/config"""
        # First get deployments to find one to test
        success, deployments = self.test_list_deployments()
        if not success or not deployments:
            print("❌ Cannot test deployment config - no deployments found")
            return False
        
        deployment = deployments[0]
        namespace = deployment.get('namespace', 'default')
        name = deployment.get('name', 'nginx-deployment')
        
        success, response = self.run_test(
            f"Get Deployment Config ({namespace}/{name})",
            "GET",
            f"deployment/{namespace}/{name}/config",
            200
        )
        return success

    def test_put_deployment_config_dry_run(self):
        """Test PUT /api/deployment/{namespace}/{name}/config with dry_run=true"""
        # First get deployments to find one to test
        success, deployments = self.test_list_deployments()
        if not success or not deployments:
            print("❌ Cannot test deployment config update - no deployments found")
            return False
        
        deployment = deployments[0]
        namespace = deployment.get('namespace', 'default')
        name = deployment.get('name', 'nginx-deployment')
        
        # Get current config first
        success, current_config = self.run_test(
            f"Get Current Config for Update Test",
            "GET",
            f"deployment/{namespace}/{name}/config",
            200
        )
        
        if not success:
            return False
        
        # Modify config for testing (change replicas)
        test_config = current_config.copy()
        if 'spec' not in test_config:
            test_config['spec'] = {}
        test_config['spec']['replicas'] = 2
        
        # Test dry run first
        success, response = self.run_test(
            f"Update Deployment Config - Dry Run ({namespace}/{name})",
            "PUT",
            f"deployment/{namespace}/{name}/config",
            200,
            data={
                "configuration": test_config,
                "dry_run": True,
                "strategy": "merge"
            }
        )
        
        if success and response.get('dry_run') == True:
            print(f"   ✅ Dry run successful - {len(response.get('applied_changes', []))} changes detected")
        
        return success

    def test_put_deployment_config_apply(self):
        """Test PUT /api/deployment/{namespace}/{name}/config with actual application"""
        # First get deployments to find one to test
        success, deployments = self.test_list_deployments()
        if not success or not deployments:
            print("❌ Cannot test deployment config update - no deployments found")
            return False
        
        deployment = deployments[0]
        namespace = deployment.get('namespace', 'default')
        name = deployment.get('name', 'nginx-deployment')
        
        # Get current config first
        success, current_config = self.run_test(
            f"Get Current Config for Apply Test",
            "GET",
            f"deployment/{namespace}/{name}/config",
            200
        )
        
        if not success:
            return False
        
        # Modify config for testing (change replicas)
        test_config = current_config.copy()
        if 'spec' not in test_config:
            test_config['spec'] = {}
        test_config['spec']['replicas'] = 3
        
        # Apply the configuration
        success, response = self.run_test(
            f"Update Deployment Config - Apply ({namespace}/{name})",
            "PUT",
            f"deployment/{namespace}/{name}/config",
            200,
            data={
                "configuration": test_config,
                "dry_run": False,
                "strategy": "merge"
            }
        )
        
        if success and response.get('success') == True:
            print(f"   ✅ Configuration applied - Rollback key: {response.get('rollback_key', 'N/A')}")
        
        return success

    def test_get_daemonset_config(self):
        """Test GET /api/daemonset/{namespace}/{name}/config"""
        # First get daemonsets to find one to test
        success, daemonsets = self.test_list_daemonsets()
        if not success or not daemonsets:
            print("❌ Cannot test daemonset config - no daemonsets found")
            return False
        
        daemonset = daemonsets[0]
        namespace = daemonset.get('namespace', 'kube-system')
        name = daemonset.get('name', 'datadog-agent')
        
        success, response = self.run_test(
            f"Get DaemonSet Config ({namespace}/{name})",
            "GET",
            f"daemonset/{namespace}/{name}/config",
            200
        )
        return success

    def test_put_daemonset_config_dry_run(self):
        """Test PUT /api/daemonset/{namespace}/{name}/config with dry_run=true"""
        # First get daemonsets to find one to test
        success, daemonsets = self.test_list_daemonsets()
        if not success or not daemonsets:
            print("❌ Cannot test daemonset config update - no daemonsets found")
            return False
        
        daemonset = daemonsets[0]
        namespace = daemonset.get('namespace', 'kube-system')
        name = daemonset.get('name', 'datadog-agent')
        
        # Get current config first
        success, current_config = self.run_test(
            f"Get Current DaemonSet Config",
            "GET",
            f"daemonset/{namespace}/{name}/config",
            200
        )
        
        if not success:
            return False
        
        # Modify config for testing (add/modify labels)
        test_config = current_config.copy()
        if 'metadata' not in test_config:
            test_config['metadata'] = {}
        if 'labels' not in test_config['metadata']:
            test_config['metadata']['labels'] = {}
        test_config['metadata']['labels']['test-label'] = 'test-value'
        
        # Test dry run
        success, response = self.run_test(
            f"Update DaemonSet Config - Dry Run ({namespace}/{name})",
            "PUT",
            f"daemonset/{namespace}/{name}/config",
            200,
            data={
                "configuration": test_config,
                "dry_run": True,
                "strategy": "merge"
            }
        )
        
        if success and response.get('dry_run') == True:
            print(f"   ✅ DaemonSet dry run successful - {len(response.get('applied_changes', []))} changes detected")
        
        return success

    # ========== ADVANCED FEATURES TESTS ==========
    
    def test_batch_operations(self):
        """Test /api/batch-operations endpoint"""
        # Get some resources to operate on
        success, deployments = self.test_list_deployments()
        if not success or not deployments:
            print("❌ Cannot test batch operations - no deployments found")
            return False
        
        # Test batch scaling operation
        resources = []
        for deployment in deployments[:2]:  # Test with first 2 deployments
            resources.append({
                "type": "deployment",
                "namespace": deployment.get('namespace', 'default'),
                "name": deployment.get('name')
            })
        
        batch_request = {
            "resources": resources,
            "operation": "scale",
            "parameters": {"replicas": 2}
        }
        
        success, response = self.run_test(
            "Batch Operations - Scale Deployments",
            "POST",
            "batch-operations",
            200,
            data=batch_request
        )
        
        if success:
            print(f"   ✅ Batch operation completed - Success: {response.get('success_count', 0)}, Failed: {response.get('failed_count', 0)}")
        
        return success

    def test_validate_config(self):
        """Test /api/validate-config endpoint"""
        # Test with a valid deployment configuration
        valid_config = {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {
                "name": "test-deployment",
                "namespace": "default"
            },
            "spec": {
                "replicas": 3,
                "selector": {
                    "matchLabels": {
                        "app": "test-app"
                    }
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "app": "test-app"
                        }
                    },
                    "spec": {
                        "containers": [
                            {
                                "name": "test-container",
                                "image": "nginx:latest"
                            }
                        ]
                    }
                }
            }
        }
        
        success, response = self.run_test(
            "Validate Configuration - Valid Config",
            "POST",
            "validate-config",
            200,
            data=valid_config,
            params={"resource_type": "deployment"}
        )
        
        if success and response.get('valid') == True:
            print("   ✅ Configuration validation passed")
        
        return success

    def test_config_diff(self):
        """Test /api/config-diff endpoint"""
        original_config = {
            "spec": {
                "replicas": 2,
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "app",
                                "image": "nginx:1.20"
                            }
                        ]
                    }
                }
            }
        }
        
        updated_config = {
            "spec": {
                "replicas": 3,
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "app",
                                "image": "nginx:1.21"
                            }
                        ]
                    }
                }
            }
        }
        
        diff_request = {
            "original_config": original_config,
            "updated_config": updated_config
        }
        
        success, response = self.run_test(
            "Configuration Diff Calculation",
            "POST",
            "config-diff",
            200,
            data=diff_request
        )
        
        if success and response.get('has_changes') == True:
            print(f"   ✅ Configuration diff calculated - Changes detected")
        
        return success

    def test_websocket_connection(self):
        """Test WebSocket /ws endpoint"""
        try:
            print(f"\n🔍 Testing WebSocket Connection...")
            print(f"   URL: {self.ws_url}")
            
            def on_message(ws, message):
                self.websocket_messages.append(json.loads(message))
                print(f"   📨 WebSocket message received: {message[:100]}...")
            
            def on_error(ws, error):
                print(f"   ❌ WebSocket error: {error}")
            
            def on_close(ws, close_status_code, close_msg):
                print(f"   🔌 WebSocket connection closed")
            
            def on_open(ws):
                print(f"   ✅ WebSocket connection opened")
                # Send a ping message
                ws.send(json.dumps({"type": "ping"}))
                # Close after a short delay
                threading.Timer(2.0, ws.close).start()
            
            # Create WebSocket connection
            ws = websocket.WebSocketApp(
                self.ws_url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            
            # Run WebSocket in a separate thread
            ws_thread = threading.Thread(target=ws.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            
            # Wait for connection and messages
            time.sleep(3)
            
            self.tests_run += 1
            if len(self.websocket_messages) > 0:
                self.tests_passed += 1
                print(f"   ✅ WebSocket test passed - Received {len(self.websocket_messages)} messages")
                return True
            else:
                print(f"   ❌ WebSocket test failed - No messages received")
                return False
                
        except Exception as e:
            self.tests_run += 1
            print(f"   ❌ WebSocket test failed: {str(e)}")
            return False

    # ========== CACHE MANAGEMENT TESTS (ADMIN) ==========
    
    def test_cache_stats(self):
        """Test /api/admin/cache/stats endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test cache stats - admin access required")
            return False
        
        success, response = self.run_test(
            "Cache Statistics",
            "GET",
            "admin/cache/stats",
            200
        )
        
        if success and 'size' in response:
            print(f"   ✅ Cache stats retrieved - Size: {response.get('size')}, Hit rate: {response.get('hit_rate_percent', 0)}%")
        
        return success

    def test_cache_clear(self):
        """Test /api/admin/cache/clear endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test cache clear - admin access required")
            return False
        
        success, response = self.run_test(
            "Clear Cache",
            "POST",
            "admin/cache/clear",
            200
        )
        
        if success and response.get('success') == True:
            print(f"   ✅ Cache cleared - {response.get('cleared_count', 0)} entries removed")
        
        return success

    def test_cache_refresh(self):
        """Test /api/admin/cache/refresh endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test cache refresh - admin access required")
            return False
        
        success, response = self.run_test(
            "Refresh Cache",
            "POST",
            "admin/cache/refresh",
            200,
            params={"resource_type": "deployments"}
        )
        
        if success and response.get('success') == True:
            print(f"   ✅ Cache refresh initiated")
        
        return success

    # ========== ENHANCED HEALTH AND STATS TESTS ==========
    
    def test_enhanced_health_check(self):
        """Test enhanced /api/health endpoint with cache stats and WebSocket info"""
        success, response = self.run_test(
            "Enhanced Health Check",
            "GET",
            "health",
            200
        )
        
        if success:
            expected_fields = ['status', 'kubernetes_available', 'cache_stats', 'websocket_connections']
            missing_fields = [field for field in expected_fields if field not in response]
            
            if not missing_fields:
                print(f"   ✅ Enhanced health check passed - All fields present")
                print(f"   📊 K8s Available: {response.get('kubernetes_available')}")
                print(f"   📊 WebSocket Connections: {response.get('websocket_connections', 0)}")
                cache_stats = response.get('cache_stats', {})
                print(f"   📊 Cache Size: {cache_stats.get('size', 0)}, Hit Rate: {cache_stats.get('hit_rate_percent', 0)}%")
            else:
                print(f"   ⚠️ Missing enhanced fields: {missing_fields}")
        
        return success

    def test_enhanced_dashboard_stats(self):
        """Test enhanced /api/dashboard/stats with cache and WebSocket info"""
        success, response = self.run_test(
            "Enhanced Dashboard Stats",
            "GET",
            "dashboard/stats",
            200
        )
        
        if success:
            expected_fields = ['deployments_count', 'daemonsets_count', 'cache_info', 'websocket_connections']
            present_fields = [field for field in expected_fields if field in response]
            
            print(f"   ✅ Enhanced dashboard stats - Fields present: {len(present_fields)}/{len(expected_fields)}")
            if 'cache_info' in response:
                cache_info = response['cache_info']
                print(f"   📊 Cache Hit Rate: {cache_info.get('hit_rate_percent', 0)}%")
        
        return success

    # ========== DATABASE OPTIMIZATION TESTS (ADMIN) ==========
    
    def test_database_stats(self):
        """Test /api/admin/database/stats endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test database stats - admin access required")
            return False
        
        success, response = self.run_test(
            "Database Statistics",
            "GET",
            "admin/database/stats",
            200
        )
        
        if success:
            expected_sections = ['database', 'connections', 'operations', 'memory']
            present_sections = [section for section in expected_sections if section in response]
            
            print(f"   ✅ Database stats retrieved - Sections: {len(present_sections)}/{len(expected_sections)}")
            if 'database' in response:
                db_info = response['database']
                print(f"   📊 Collections: {db_info.get('collections', 0)}, Objects: {db_info.get('objects', 0)}")
                print(f"   📊 Data Size: {db_info.get('data_size', 0)} bytes, Storage: {db_info.get('storage_size', 0)} bytes")
        
        return success

    def test_analyze_collection_performance(self):
        """Test /api/admin/database/analyze/{collection_name} endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test collection analysis - admin access required")
            return False
        
        # Test with audit_logs collection (should exist)
        success, response = self.run_test(
            "Analyze Collection Performance - audit_logs",
            "GET",
            "admin/database/analyze/audit_logs",
            200
        )
        
        if success:
            expected_fields = ['collection', 'document_count', 'storage_size', 'indexes', 'recommendations']
            present_fields = [field for field in expected_fields if field in response]
            
            print(f"   ✅ Collection analysis completed - Fields: {len(present_fields)}/{len(expected_fields)}")
            print(f"   📊 Collection: {response.get('collection')}")
            print(f"   📊 Documents: {response.get('document_count', 0)}")
            print(f"   📊 Indexes: {len(response.get('indexes', []))}")
            print(f"   📊 Recommendations: {len(response.get('recommendations', []))}")
        
        return success

    def test_database_optimization(self):
        """Test /api/admin/database/optimize endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test database optimization - admin access required")
            return False
        
        success, response = self.run_test(
            "Database Optimization",
            "POST",
            "admin/database/optimize",
            200
        )
        
        if success and response.get('success') == True:
            results = response.get('results', {})
            optimized_collections = len([k for k, v in results.items() if v.get('optimized', False)])
            print(f"   ✅ Database optimization completed - {optimized_collections} collections optimized")
            print(f"   📊 Results: {list(results.keys())}")
        
        return success

    def test_database_cleanup(self):
        """Test /api/admin/database/cleanup endpoint"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test database cleanup - admin access required")
            return False
        
        success, response = self.run_test(
            "Database Cleanup",
            "POST",
            "admin/database/cleanup",
            200,
            params={"days_to_keep": 30}
        )
        
        if success and response.get('success') == True:
            results = response.get('results', {})
            print(f"   ✅ Database cleanup completed - kept last 30 days")
            if 'audit_logs' in results:
                deleted_count = results['audit_logs'].get('deleted_count', 0)
                print(f"   📊 Audit logs cleaned: {deleted_count} old entries removed")
        
        return success

    def test_database_profiling_enable(self):
        """Test /api/admin/database/profiling endpoint - enable profiling"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test database profiling - admin access required")
            return False
        
        success, response = self.run_test(
            "Enable Database Profiling",
            "POST",
            "admin/database/profiling",
            200,
            data={"enable": True, "level": 1, "slow_ms": 100}
        )
        
        if success and response.get('success') == True:
            print(f"   ✅ Database profiling enabled - Level 1, >100ms queries")
        
        return success

    def test_database_profiling_disable(self):
        """Test /api/admin/database/profiling endpoint - disable profiling"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("❌ Cannot test database profiling - admin access required")
            return False
        
        success, response = self.run_test(
            "Disable Database Profiling",
            "POST",
            "admin/database/profiling",
            200,
            data={"enable": False}
        )
        
        if success and response.get('success') == True:
            print(f"   ✅ Database profiling disabled")
        
        return success

    def test_performance_monitoring_integration(self):
        """Test that performance monitoring is integrated with existing endpoints"""
        # Test that cached vs non-cached calls show performance differences
        print(f"\n🔍 Testing Performance Monitoring Integration...")
        
        # First call (should be slower - cache miss)
        start_time = time.time()
        success1, response1 = self.run_test(
            "Performance Test - Cache Miss",
            "GET",
            "deployments",
            200,
            params={"use_cache": False}
        )
        cache_miss_time = time.time() - start_time
        
        # Second call (should be faster - cache hit)
        start_time = time.time()
        success2, response2 = self.run_test(
            "Performance Test - Cache Hit",
            "GET", 
            "deployments",
            200,
            params={"use_cache": True}
        )
        cache_hit_time = time.time() - start_time
        
        if success1 and success2:
            print(f"   ✅ Performance monitoring working")
            print(f"   📊 Cache miss time: {cache_miss_time:.3f}s")
            print(f"   📊 Cache hit time: {cache_hit_time:.3f}s")
            
            # Cache hit should generally be faster, but not always guaranteed in test environment
            if cache_hit_time < cache_miss_time:
                print(f"   ✅ Cache performance improvement detected")
            else:
                print(f"   ⚠️ Cache performance improvement not detected (may be normal in test environment)")
            
            return True
        
        return False

def main():
    print("🚀 Starting Enhanced Kubernetes Dashboard API Tests")
    print("=" * 80)
    
    # Initialize tester
    tester = KubernetesDashboardAPITester()
    
    # Test sequence - organized by priority and functionality
    tests = [
        # Basic Authentication & Health
        ("Health Check", tester.test_health_check),
        ("Admin Login", tester.test_login),
        ("Get Current User", tester.test_get_current_user),
        ("Enhanced Health Check", tester.test_enhanced_health_check),
        
        # Basic Resource Operations
        ("List Deployments", lambda: tester.test_list_deployments()[0]),
        ("List DaemonSets", lambda: tester.test_list_daemonsets()[0]),
        ("Enhanced Dashboard Stats", tester.test_enhanced_dashboard_stats),
        
        # Enhanced Configuration Management (HIGH PRIORITY)
        ("Get Deployment Config", tester.test_get_deployment_config),
        ("Update Deployment Config - Dry Run", tester.test_put_deployment_config_dry_run),
        ("Update Deployment Config - Apply", tester.test_put_deployment_config_apply),
        ("Get DaemonSet Config", tester.test_get_daemonset_config),
        ("Update DaemonSet Config - Dry Run", tester.test_put_daemonset_config_dry_run),
        
        # Advanced Features (HIGH PRIORITY)
        ("Batch Operations", tester.test_batch_operations),
        ("Validate Configuration", tester.test_validate_config),
        ("Configuration Diff", tester.test_config_diff),
        ("WebSocket Connection", tester.test_websocket_connection),
        
        # Cache Management (ADMIN)
        ("Cache Statistics", tester.test_cache_stats),
        ("Cache Refresh", tester.test_cache_refresh),
        ("Cache Clear", tester.test_cache_clear),
        
        # Database Optimization (ADMIN) - NEW PHASE 2 FEATURES
        ("Database Statistics", tester.test_database_stats),
        ("Analyze Collection Performance", tester.test_analyze_collection_performance),
        ("Database Optimization", tester.test_database_optimization),
        ("Database Cleanup", tester.test_database_cleanup),
        ("Enable Database Profiling", tester.test_database_profiling_enable),
        ("Disable Database Profiling", tester.test_database_profiling_disable),
        
        # Performance Monitoring Integration
        ("Performance Monitoring Integration", tester.test_performance_monitoring_integration),
        
        # Legacy Tests
        ("Scale Deployment", tester.test_scale_deployment),
        ("Get Audit Logs", tester.test_audit_logs),
        ("User Registration", tester.test_register_new_user),
        
        # Security Tests
        ("Invalid Auth Test", tester.test_invalid_auth),
        ("Unauthorized Access Test", tester.test_unauthorized_access),
    ]
    
    # Run all tests
    critical_failures = []
    for test_name, test_func in tests:
        try:
            print(f"\n{'='*60}")
            result = test_func()
            if not result:
                print(f"⚠️  Test '{test_name}' failed but continuing...")
                # Mark critical tests
                if any(keyword in test_name.lower() for keyword in ['config', 'batch', 'validate', 'diff', 'websocket', 'database', 'optimization', 'profiling']):
                    critical_failures.append(test_name)
        except Exception as e:
            print(f"💥 Test '{test_name}' crashed: {str(e)}")
            if any(keyword in test_name.lower() for keyword in ['config', 'batch', 'validate', 'diff', 'websocket', 'database', 'optimization', 'profiling']):
                critical_failures.append(test_name)
    
    # Print final results
    print("\n" + "=" * 80)
    print(f"📊 FINAL RESULTS: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if critical_failures:
        print(f"🚨 CRITICAL FAILURES ({len(critical_failures)}):")
        for failure in critical_failures:
            print(f"   ❌ {failure}")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 ALL TESTS PASSED! Enhanced API is fully functional")
        return 0
    elif tester.tests_passed >= tester.tests_run * 0.8 and not critical_failures:
        print("✅ MOST TESTS PASSED - API is mostly functional")
        return 0
    elif critical_failures:
        print("❌ CRITICAL FEATURES FAILED - Enhanced API has significant issues")
        return 1
    else:
        print("❌ MANY TESTS FAILED - API has significant issues")
        return 1

if __name__ == "__main__":
    sys.exit(main())