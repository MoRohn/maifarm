#!/usr/bin/env python3
"""
Xcode Error Parser
Parses xcodebuild output and extracts structured error information
for automated fixing by AI agents.

Usage:
    python xcode-error-parser.py /tmp/xcode_builds/build_1.log
    python xcode-error-parser.py --json /tmp/xcode_builds/build_1.log
"""

import re
import json
import sys
import os
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Optional

@dataclass
class SwiftError:
    """Represents a Swift compilation error"""
    file_path: str
    line: int
    column: int
    error_type: str  # error, warning, note
    message: str
    code_context: Optional[str] = None
    suggestion: Optional[str] = None

    def to_dict(self):
        return asdict(self)

    def __str__(self):
        return f"{os.path.basename(self.file_path)}:{self.line}:{self.column}: {self.error_type}: {self.message}"


class XcodeErrorParser:
    """Parses xcodebuild output to extract errors"""

    # Regex patterns for different error types
    ERROR_PATTERN = re.compile(
        r'^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$'
    )

    COMMON_ERROR_FIXES = {
        "is ambiguous for type lookup": "Rename one of the duplicate type definitions or use fully qualified names",
        "invalid redeclaration": "Remove or rename the duplicate declaration",
        "use [:] to get an empty dictionary literal": "Replace [] with [:] for empty dictionary initialization",
        "main actor-isolated property can not be referenced": "Add @MainActor annotation or use async/await pattern",
        "cannot infer contextual base": "Provide explicit type annotation",
        "cannot find type": "Import the required module or define the missing type",
        "cannot assign to property": "Mark property as var instead of let, or use mutating func",
        "protocol requires function": "Implement the required protocol method",
        "missing argument label": "Add the required argument label to the function call",
    }

    def __init__(self, log_path: str):
        self.log_path = Path(log_path)
        self.errors: List[SwiftError] = []
        self.warnings: List[SwiftError] = []
        self.notes: List[SwiftError] = []

    def parse(self) -> List[SwiftError]:
        """Parse the build log and extract errors"""
        if not self.log_path.exists():
            raise FileNotFoundError(f"Log file not found: {self.log_path}")

        with open(self.log_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        i = 0
        while i < len(lines):
            line = lines[i].strip()
            match = self.ERROR_PATTERN.match(line)

            if match:
                file_path, line_num, col, error_type, message = match.groups()

                # Try to get code context from following lines
                code_context = None
                if i + 1 < len(lines) and not self.ERROR_PATTERN.match(lines[i + 1].strip()):
                    context_lines = []
                    j = i + 1
                    while j < len(lines) and j < i + 5:
                        next_line = lines[j]
                        if self.ERROR_PATTERN.match(next_line.strip()):
                            break
                        if next_line.strip():
                            context_lines.append(next_line.rstrip())
                        j += 1
                    if context_lines:
                        code_context = '\n'.join(context_lines)

                # Get suggestion if available
                suggestion = self._get_suggestion(message)

                error = SwiftError(
                    file_path=file_path,
                    line=int(line_num),
                    column=int(col),
                    error_type=error_type,
                    message=message,
                    code_context=code_context,
                    suggestion=suggestion
                )

                if error_type == 'error':
                    self.errors.append(error)
                elif error_type == 'warning':
                    self.warnings.append(error)
                else:
                    self.notes.append(error)

            i += 1

        return self.errors

    def _get_suggestion(self, message: str) -> Optional[str]:
        """Get a fix suggestion based on the error message"""
        for pattern, suggestion in self.COMMON_ERROR_FIXES.items():
            if pattern.lower() in message.lower():
                return suggestion
        return None

    def to_json(self) -> str:
        """Export parsed errors as JSON"""
        return json.dumps({
            'log_file': str(self.log_path),
            'error_count': len(self.errors),
            'warning_count': len(self.warnings),
            'errors': [e.to_dict() for e in self.errors],
            'warnings': [w.to_dict() for w in self.warnings],
            'notes': [n.to_dict() for n in self.notes],
        }, indent=2)

    def to_agent_prompt(self) -> str:
        """Generate a prompt for an AI agent to fix the errors"""
        if not self.errors:
            return "No errors found in the build log."

        prompt = f"""# Xcode Build Errors to Fix

Found {len(self.errors)} error(s) in the iOS project build.

## Errors

"""
        for i, error in enumerate(self.errors, 1):
            prompt += f"""### Error {i}
- **File:** `{error.file_path}`
- **Location:** Line {error.line}, Column {error.column}
- **Message:** {error.message}
"""
            if error.suggestion:
                prompt += f"- **Suggested Fix:** {error.suggestion}\n"
            if error.code_context:
                prompt += f"\n**Context:**\n```swift\n{error.code_context}\n```\n"
            prompt += "\n"

        prompt += """## Instructions

Please fix each error by:
1. Reading the file at the specified location
2. Understanding the error context
3. Making the minimal necessary fix
4. Verifying there are no new errors introduced

After fixing, run the build again to check for downstream errors.
"""
        return prompt


def main():
    if len(sys.argv) < 2:
        print("Usage: python xcode-error-parser.py [--json] <log_file>")
        sys.exit(1)

    output_json = False
    log_file = sys.argv[-1]

    if '--json' in sys.argv:
        output_json = True

    try:
        parser = XcodeErrorParser(log_file)
        errors = parser.parse()

        if output_json:
            print(parser.to_json())
        else:
            print(parser.to_agent_prompt())

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error parsing log: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
