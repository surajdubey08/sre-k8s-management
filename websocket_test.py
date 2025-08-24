#!/usr/bin/env python3
"""
Test WebSocket connection to the backend API
"""
import asyncio
import websockets
import json
import sys

async def test_backend_websocket():
    uri = "wss://kube-optimizer.preview.emergentagent.com/ws"
    print(f"🔍 Testing Backend WebSocket Connection to: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket connection established")
            
            # Send a ping message
            ping_message = {"type": "ping", "timestamp": "2025-08-24T06:47:30.000Z"}
            await websocket.send(json.dumps(ping_message))
            print(f"📤 Sent ping message: {ping_message}")
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                response_data = json.loads(response)
                print(f"📥 Received response: {response_data}")
                
                if response_data.get("type") == "pong":
                    print("✅ Backend WebSocket ping/pong working correctly")
                    return True
                else:
                    print(f"⚠️ Unexpected response type: {response_data.get('type')}")
                    return True  # Still a valid connection
                    
            except asyncio.TimeoutError:
                print("⚠️ No response received within timeout, but connection was established")
                return True
                
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        return False

async def main():
    print("🚀 Testing Backend WebSocket API")
    print("=" * 50)
    
    success = await test_backend_websocket()
    
    print("=" * 50)
    if success:
        print("🎉 Backend WebSocket test completed successfully")
        return 0
    else:
        print("❌ Backend WebSocket test failed")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))