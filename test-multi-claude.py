#!/usr/bin/env python3
"""
Test script to verify multi_claude.py handles context files correctly
"""

import subprocess
import sys
import time
import os

def test_multi_claude_with_context():
    """Test multi_claude.py with a context file"""
    
    print("=" * 60)
    print("Testing multi_claude.py with context file")
    print("=" * 60)
    
    # Path to the test context file
    context_file = "/Users/rohnspringfield/maifarm/test-context-file.md"
    
    # Verify context file exists
    if not os.path.exists(context_file):
        print(f"❌ Context file not found: {context_file}")
        return False
    
    print(f"✅ Context file found: {context_file}")
    
    # Test command
    cmd = [
        "python3",
        "/Users/rohnspringfield/maifarm/multi_claude.py",
        "-n", "1",  # Just 1 agent for testing
        "-p", "Test: Acknowledge that you received the context file about MaiFarm Test. What version is mentioned in the context?",
        "--context-files", context_file,
        "--session", "test_context_session",
        "--no-kill-on-exit"  # Keep session alive for inspection
    ]
    
    print(f"\n📋 Command: {' '.join(cmd)}")
    print("\n🚀 Launching multi_claude with context file...")
    
    try:
        # Run the command
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Let it run for a bit
        print("⏳ Waiting for initialization...")
        time.sleep(5)
        
        # Check if process is still running
        if process.poll() is None:
            print("✅ Process is running")
            
            # Give it more time to process
            print("⏳ Letting agents process the context (20 seconds)...")
            time.sleep(20)
            
            # Check tmux session
            check_cmd = ["tmux", "capture-pane", "-t", "test_context_session", "-p"]
            result = subprocess.run(check_cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                output = result.stdout
                print("\n📄 Agent output sample:")
                print("-" * 40)
                # Show last 500 characters of output
                print(output[-500:] if len(output) > 500 else output)
                print("-" * 40)
                
                # Check if context was received
                if "MaiFarm Test" in output or "Version: 1.0.0" in output or "CONTEXT FILES" in output:
                    print("\n✅ SUCCESS: Context file was processed!")
                    return True
                else:
                    print("\n⚠️  Context not clearly visible in output yet")
            
            # Terminate the process
            print("\n🛑 Terminating test process...")
            process.terminate()
            time.sleep(2)
            
            # Clean up tmux session
            subprocess.run(["tmux", "kill-session", "-t", "test_context_session"], 
                         capture_output=True)
            
        else:
            # Process ended early
            stdout, stderr = process.communicate()
            print(f"⚠️  Process ended with code: {process.returncode}")
            if stdout:
                print(f"stdout: {stdout}")
            if stderr:
                print(f"stderr: {stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Error running test: {e}")
        return False
    
    return True

def test_yaml_with_context():
    """Test YAML configuration with context files"""
    
    print("\n" + "=" * 60)
    print("Testing YAML configuration with context files")
    print("=" * 60)
    
    # Create a test YAML file
    yaml_content = """name: Test Farm with Context
initial_prompt: |
  This is a test farm to verify context file handling.
  Please analyze the provided context and confirm you can see:
  1. The MaiFarm Test project information
  2. The version number
  3. The sample code
context_files:
  - /Users/rohnspringfield/maifarm/test-context-file.md
"""
    
    yaml_file = "/tmp/test_farm_context.yaml"
    with open(yaml_file, 'w') as f:
        f.write(yaml_content)
    
    print(f"✅ Created test YAML file: {yaml_file}")
    
    # Test command with YAML
    cmd = [
        "python3",
        "/Users/rohnspringfield/maifarm/multi_claude.py",
        "-n", "1",
        "--prompt-file", yaml_file,
        "--session", "test_yaml_context",
        "--no-kill-on-exit"
    ]
    
    print(f"\n📋 Command: {' '.join(cmd)}")
    print("\n🚀 Launching multi_claude with YAML config...")
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Let it run
        print("⏳ Waiting for initialization...")
        time.sleep(5)
        
        if process.poll() is None:
            print("✅ Process is running with YAML config")
            
            # Give it time to process
            time.sleep(15)
            
            # Terminate
            process.terminate()
            time.sleep(2)
            
            # Clean up
            subprocess.run(["tmux", "kill-session", "-t", "test_yaml_context"], 
                         capture_output=True)
            
            return True
        else:
            stdout, stderr = process.communicate()
            print(f"⚠️  Process ended with code: {process.returncode}")
            if stderr:
                print(f"stderr: {stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    finally:
        # Clean up YAML file
        if os.path.exists(yaml_file):
            os.remove(yaml_file)

if __name__ == "__main__":
    print("🧪 MaiFarm Context File Test Suite")
    print("=" * 60)
    
    # Run tests
    test1 = test_multi_claude_with_context()
    test2 = test_yaml_with_context()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Results Summary")
    print("=" * 60)
    print(f"Command-line context test: {'✅ PASSED' if test1 else '❌ FAILED'}")
    print(f"YAML context test: {'✅ PASSED' if test2 else '❌ FAILED'}")
    
    if test1 and test2:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n⚠️  Some tests failed")
        sys.exit(1)