# Contributing to Trump Infog

First off, thank you for considering contributing to Trump Infog! It's people like you that make Trump Infog such a great tool for creating professional infographics.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:

- **Be Respectful**: Value each other's ideas, styles, and viewpoints
- **Be Direct but Professional**: We are all professionals; let's act like it
- **Be Inclusive**: Seek diverse perspectives. Diversity of thought and people drives innovation
- **Be Open**: Be open to feedback and changes

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

1. **Clear Title**: Summarize the issue
2. **Description**: What went wrong?
3. **Steps to Reproduce**: List exact steps
4. **Expected Behavior**: What should happen?
5. **Actual Behavior**: What actually happened?
6. **Screenshots**: If applicable
7. **Environment**: OS, browser, version

Example:
```markdown
**Title**: Export to PDF fails with large infographics

**Description**: When exporting infographics with >10 visualizations to PDF, the process fails with a timeout error.

**Steps to Reproduce**:
1. Create infographic with 15 charts
2. Click Export → PDF
3. Wait for processing

**Expected**: PDF downloads successfully
**Actual**: Error message "Export timeout"

**Environment**: macOS 12.6, Chrome 120, Trump Infog v2.1.0
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Include:

- **Use Case**: Why is this needed?
- **Proposed Solution**: How should it work?
- **Alternative Solutions**: Other approaches considered
- **Additional Context**: Mockups, examples

### Pull Requests

1. **Fork the Repository**
2. **Create Feature Branch**: `git checkout -b feature/AmazingFeature`
3. **Commit Changes**: `git commit -m 'Add some AmazingFeature'`
4. **Push to Branch**: `git push origin feature/AmazingFeature`
5. **Open Pull Request**

## Development Process

### 1. Setting Up Development Environment

```bash
# Clone your fork
git clone https://github.com/yourusername/trump-infog.git
cd trump-infog

# Add upstream remote
git remote add upstream https://github.com/trump-infog/trump-infog.git

# Install dependencies
npm install

# Set up pre-commit hooks
npm run prepare
```

### 2. Making Changes

#### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `style/` - Code style changes
- `refactor/` - Code refactoring
- `test/` - Test additions
- `chore/` - Maintenance tasks

Examples:
- `feature/add-chart-animations`
- `fix/export-memory-leak`
- `docs/update-api-examples`

#### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat(editor): add real-time collaboration

- Implement WebSocket-based cursor sharing
- Add user presence indicators
- Create collaboration toolbar

Closes #123
```

### 3. Code Standards

#### TypeScript

```typescript
// Use explicit types
interface UserData {
  id: string;
  name: string;
  role: UserRole;
}

// Avoid any
const processData = (data: UserData): ProcessedData => {
  // Implementation
};

// Use enums for constants
enum ChartType {
  BAR = 'bar',
  LINE = 'line',
  PIE = 'pie'
}
```

#### React Components

```tsx
// Functional components with TypeScript
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  label, 
  onClick, 
  variant = 'primary',
  disabled = false 
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
};
```

#### File Organization

```
src/
├── components/
│   └── Button/
│       ├── Button.tsx         # Component
│       ├── Button.test.tsx    # Tests
│       ├── Button.module.css  # Styles
│       └── index.ts          # Export
```

### 4. Testing

#### Unit Tests

```typescript
// Button.test.tsx
import { render, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with label', () => {
    const { getByText } = render(
      <Button label="Click me" onClick={() => {}} />
    );
    expect(getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    const { getByText } = render(
      <Button label="Click me" onClick={handleClick} />
    );
    fireEvent.click(getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

#### Integration Tests

```typescript
// api.test.ts
describe('Infographic API', () => {
  it('creates infographic successfully', async () => {
    const response = await request(app)
      .post('/api/infographics')
      .send({
        title: 'Test Infographic',
        template: 'election-analysis'
      })
      .expect(201);
    
    expect(response.body).toHaveProperty('id');
    expect(response.body.title).toBe('Test Infographic');
  });
});
```

### 5. Documentation

#### Code Comments

```typescript
/**
 * Generates an infographic based on the provided configuration.
 * 
 * @param config - The infographic configuration
 * @param options - Additional generation options
 * @returns Promise resolving to the generated infographic
 * 
 * @example
 * const infographic = await generateInfographic({
 *   title: 'Election Results',
 *   template: 'election-analysis',
 *   dataSource: 'live-news'
 * });
 */
export async function generateInfographic(
  config: InfographicConfig,
  options?: GenerationOptions
): Promise<Infographic> {
  // Implementation
}
```

#### README Updates

When adding features, update relevant documentation:

1. Add to feature list
2. Update API examples
3. Add configuration options
4. Include in troubleshooting if needed

### 6. Performance Considerations

- Lazy load heavy components
- Optimize images and assets
- Use React.memo for expensive renders
- Implement virtual scrolling for lists
- Profile and benchmark changes

### 7. Security

- Never commit secrets or API keys
- Validate all user inputs
- Use parameterized queries
- Implement proper authentication
- Follow OWASP guidelines

## Review Process

### Pull Request Checklist

Before submitting:

- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No console.logs or debugger statements
- [ ] Rebased on latest main

### Review Criteria

Reviewers will check:

1. **Functionality**: Does it work as intended?
2. **Code Quality**: Is it clean and maintainable?
3. **Performance**: No regressions?
4. **Security**: Any vulnerabilities?
5. **Tests**: Adequate coverage?
6. **Documentation**: Clear and updated?

## Release Process

1. **Version Bump**: Follow semantic versioning
2. **Changelog**: Update CHANGELOG.md
3. **Release Notes**: Describe changes
4. **Tag Release**: `git tag v2.1.0`
5. **Deploy**: Automated via CI/CD

## Getting Help

- **Discord**: [Join our community](https://discord.gg/trumpinfog)
- **Discussions**: Use GitHub Discussions
- **Email**: dev@trumpinfog.com

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Annual contributor spotlight

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Trump Infog! Your efforts help make data visualization accessible to everyone. 🚀