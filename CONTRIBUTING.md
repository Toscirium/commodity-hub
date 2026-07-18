# Contributing to Commodity Trading Platform

We're excited that you're interested in contributing to our commodity trading platform! This guide will help you get started with contributing to the project.

## 🌟 How to Contribute

### Types of Contributions
- **Bug Reports** - Help us identify and fix issues
- **Feature Requests** - Suggest new functionality
- **Code Contributions** - Submit bug fixes or new features
- **Documentation** - Improve our docs and guides
- **Testing** - Write tests or test new features
- **Design** - UI/UX improvements and suggestions

## 🚀 Getting Started

### 1. Fork and Clone the Repository
```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/yourusername/commodity-platform.git
cd commodity-platform

# Add the original repository as upstream
git remote add upstream https://github.com/originalrepo/commodity-platform.git
```

### 2. Set Up Development Environment
```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

### 3. Create a Feature Branch
```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

## 🏗️ Development Guidelines

### Code Style
We use ESLint and Prettier for consistent code formatting:
```bash
# Check code style
npm run lint

# Auto-fix style issues
npm run lint:fix

# Format code
npm run format
```

### TypeScript Standards
- **Strict type checking** - All code must be properly typed
- **Interface definitions** - Use interfaces for object shapes
- **Generic types** - Leverage generics for reusable components
- **Type guards** - Use type guards for runtime type checking

Example:
```typescript
interface CommodityData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

const processCommodity = (data: unknown): CommodityData | null => {
  if (typeof data === 'object' && data !== null) {
    // Type guard implementation
    return data as CommodityData;
  }
  return null;
};
```

### Component Standards
- **Functional components** with hooks
- **Props interfaces** clearly defined
- **Error boundaries** for robust error handling
- **Accessibility** - ARIA labels and keyboard navigation

Example:
```typescript
interface CommodityCardProps {
  commodity: CommodityData;
  onSelect: (symbol: string) => void;
  isSelected?: boolean;
}

export const CommodityCard: React.FC<CommodityCardProps> = ({
  commodity,
  onSelect,
  isSelected = false
}) => {
  return (
    <div 
      className="commodity-card"
      onClick={() => onSelect(commodity.symbol)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
    >
      {/* Component content */}
    </div>
  );
};
```

### Testing Standards
We aim for comprehensive test coverage:

```typescript
// Unit test example
describe('CommodityCard', () => {
  const mockCommodity: CommodityData = {
    symbol: 'CL=F',
    price: 65.50,
    change: 1.25,
    changePercent: 1.95
  };

  it('should call onSelect when clicked', () => {
    const mockOnSelect = jest.fn();
    render(
      <CommodityCard commodity={mockCommodity} onSelect={mockOnSelect} />
    );
    
    fireEvent.click(screen.getByRole('button'));
    expect(mockOnSelect).toHaveBeenCalledWith('CL=F');
  });
});
```

### Supabase Edge Functions
For edge functions, follow these guidelines:

```typescript
// Edge function example structure
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new EdgeLogger({ functionName: 'your-function-name' });

  try {
    logger.info('Function started');
    
    // Your function logic here
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Function failed', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

## 🧪 Testing Your Changes

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Check test coverage
npm run test:coverage
```

### Manual Testing Checklist
Before submitting a PR, manually test:
- [ ] All new features work as expected
- [ ] Existing functionality is not broken
- [ ] Mobile responsiveness is maintained
- [ ] Accessibility features work correctly
- [ ] Error handling is appropriate
- [ ] Loading states are implemented

## 📝 Commit Guidelines

We use [Conventional Commits](https://conventionalcommits.org/) for clear commit messages:

### Commit Types
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring without feature changes
- `test:` - Adding or updating tests
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

### Examples
```bash
git commit -m "feat: add real-time price alerts for commodities"
git commit -m "fix: resolve chart rendering issue on mobile devices"
git commit -m "docs: update API documentation for new endpoints"
git commit -m "refactor: optimize commodity data fetching logic"
```

## 🔍 Pull Request Process

### Before Submitting
1. **Sync with upstream** to avoid conflicts:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run the test suite**:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

3. **Update documentation** if needed

### PR Requirements
- [ ] Clear title and description
- [ ] Link to related issues
- [ ] Tests for new functionality
- [ ] Screenshots for UI changes
- [ ] Documentation updates
- [ ] No merge conflicts

### PR Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Screenshots
(If applicable)

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

## 🚨 Reporting Issues

### Bug Reports
When reporting bugs, please include:
- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected behavior** vs actual behavior
- **Screenshots** if applicable
- **Environment details** (browser, OS, etc.)
- **Console errors** if any

### Feature Requests
For feature requests, provide:
- **Clear description** of the proposed feature
- **Use case** - why is this needed?
- **Acceptance criteria** - what defines "done"?
- **Mockups or wireframes** if applicable

## 🏷️ Issue Labels

We use labels to organize issues:
- `bug` - Something isn't working
- `enhancement` - New feature or request
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `priority: high` - Urgent issues
- `type: documentation` - Documentation improvements

## 🌐 Community Guidelines

### Code of Conduct
- **Be respectful** - Treat everyone with respect
- **Be inclusive** - Welcome people of all backgrounds
- **Be collaborative** - Work together constructively
- **Be helpful** - Support other contributors

### Communication
- **Issues** - For bug reports and feature requests
- **Discussions** - For general questions and ideas
- **Discord** - For real-time chat and support
- **Email** - For private or sensitive matters

## 🎯 Areas That Need Help

We especially welcome contributions in these areas:
- **Mobile app development** (React Native/Capacitor)
- **Performance optimization**
- **Accessibility improvements**
- **Testing coverage**
- **Documentation and tutorials**
- **Internationalization (i18n)**
- **New data source integrations**

## 📚 Learning Resources

### React & TypeScript
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

### Supabase
- [Supabase Documentation](https://supabase.com/docs)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

### Tailwind CSS
- [Tailwind Documentation](https://tailwindcss.com/docs)
- [Tailwind UI Components](https://tailwindui.com/)

## 🎉 Recognition

Contributors will be recognized through:
- **Contributors list** in the README
- **Changelog mentions** for significant contributions
- **Special badges** for regular contributors
- **Priority access** to new features
- **Direct communication** with the core team

## 📞 Getting Help

If you need help getting started:
1. **Check existing issues** and discussions
2. **Ask in Discord** for real-time help
3. **Create a discussion** for general questions
4. **Email us** at contributors@commodityplatform.com

Thank you for contributing to the Commodity Trading Platform! 🚀