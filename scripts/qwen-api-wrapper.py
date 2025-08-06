#!/usr/bin/env python3
"""
Qwen API Wrapper for Claude Code Compatibility
This script provides a Claude-like interface for Qwen3-Coder API
"""

import os
import sys
import json
import requests
from typing import List, Dict, Any

class QwenAPIWrapper:
    def __init__(self):
        self.api_key = os.environ.get('QWEN_API_KEY', '')
        self.api_endpoint = os.environ.get('QWEN_API_ENDPOINT', 'https://dashscope.aliyuncs.com/api/v1')
        self.model = os.environ.get('QWEN_MODEL', 'qwen-coder-480b')
        
        if not self.api_key:
            print("[Qwen API] Error: QWEN_API_KEY not set in environment")
            sys.exit(1)
    
    def send_message(self, prompt: str) -> str:
        """Send a message to Qwen API and return the response"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'input': {
                'messages': [
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ]
            },
            'parameters': {
                'temperature': 0.7,
                'max_tokens': 8192,
                'top_p': 0.95
            },
            'model': self.model
        }
        
        try:
            response = requests.post(
                f'{self.api_endpoint}/services/aigc/text-generation/generation',
                headers=headers,
                json=payload,
                timeout=300
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get('output', {}).get('text', 'No response generated')
            else:
                return f"Error: {response.status_code} - {response.text}"
                
        except Exception as e:
            return f"Error calling Qwen API: {str(e)}"
    
    def interactive_mode(self):
        """Run in interactive mode similar to Claude CLI"""
        print(f"[Qwen3-Coder CLI Proxy]")
        print(f"Model: {self.model}")
        print(f"Context: up to 256K tokens")
        print("Type 'exit' or 'quit' to end session")
        print("-" * 50)
        
        while True:
            try:
                # Get user input
                prompt = input("\nYou: ").strip()
                
                if prompt.lower() in ['exit', 'quit']:
                    print("Goodbye!")
                    break
                
                if not prompt:
                    continue
                
                # Send to API
                print("\nQwen3-Coder: ", end='', flush=True)
                response = self.send_message(prompt)
                print(response)
                
            except KeyboardInterrupt:
                print("\n\nSession interrupted. Goodbye!")
                break
            except Exception as e:
                print(f"\nError: {str(e)}")

def main():
    """Main entry point"""
    wrapper = QwenAPIWrapper()
    
    if len(sys.argv) > 1:
        # Command mode - join all arguments as the prompt
        prompt = ' '.join(sys.argv[1:])
        response = wrapper.send_message(prompt)
        print(response)
    else:
        # Interactive mode
        wrapper.interactive_mode()

if __name__ == '__main__':
    main()