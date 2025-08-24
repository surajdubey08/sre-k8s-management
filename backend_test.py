import requests
import sys
import json
import websocket
import threading
import time
from datetime import datetime

class KubernetesDashboardAPITester:
    def __init__(self, base_url="https://kube-updater.preview.emergentagent.com"):
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

def main():
    print("🚀 Starting Kubernetes Dashboard API Tests")
    print("=" * 60)
    
    # Initialize tester
    tester = KubernetesDashboardAPITester()
    
    # Test sequence
    tests = [
        ("Health Check", tester.test_health_check),
        ("Admin Login", tester.test_login),
        ("Get Current User", tester.test_get_current_user),
        ("User Registration", tester.test_register_new_user),
        ("Dashboard Stats", tester.test_dashboard_stats),
        ("List Deployments", lambda: tester.test_list_deployments()[0]),
        ("List DaemonSets", lambda: tester.test_list_daemonsets()[0]),
        ("Scale Deployment", tester.test_scale_deployment),
        ("Get Audit Logs", tester.test_audit_logs),
        ("Invalid Auth Test", tester.test_invalid_auth),
        ("Unauthorized Access Test", tester.test_unauthorized_access),
    ]
    
    # Run all tests
    for test_name, test_func in tests:
        try:
            result = test_func()
            if not result:
                print(f"⚠️  Test '{test_name}' failed but continuing...")
        except Exception as e:
            print(f"💥 Test '{test_name}' crashed: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    elif tester.tests_passed >= tester.tests_run * 0.8:
        print("✅ Most tests passed - API is mostly functional")
        return 0
    else:
        print("❌ Many tests failed - API has significant issues")
        return 1

if __name__ == "__main__":
    sys.exit(main())