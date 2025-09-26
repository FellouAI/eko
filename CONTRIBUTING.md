# Contributing to Eko

Thank you for your interest in contributing to Eko! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- Node.js (>= 18.0.0)
- [pnpm](https://pnpm.io/installation) (latest stable version)
- Git

This project uses pnpm as its package manager. Please ensure you have it installed.

### Setting Up the Development Environment

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/your-username/eko.git
   cd eko
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Start the TypeScript compiler in watch mode:

   ```bash
   pnpm run dev
   ```

5. Run tests:
   ```bash
   pnpm test
   ```

### Development Commands

- `pnpm run dev`: Start TypeScript compiler in watch mode
- `pnpm test`: Run tests
- `pnpm run test:watch`: Run tests in watch mode
- `pnpm run build`: Build the project
- `pnpm run lint`: Run linting
- `pnpm run format`: Format code using Prettier

## Branching Strategy

### Branch Types

- `main`: Production-ready code
- `feature/*`: New features or enhancements (e.g., `feature/workflow-parser`)
- `fix/*`: Bug fixes (e.g., `fix/parsing-error`)
- `refactor/*`: Code refactoring without functionality changes
- `docs/*`: Documentation changes
- `test/*`: Adding or modifying tests
- `chore/*`: Maintenance tasks
- `build/*`: Changes affecting the build system

### Branch Naming Convention

- Use lowercase letters and hyphens
- Start with the type followed by a descriptive name
- Examples:
  - `feature/json-parser`
  - `fix/validation-error`
  - `refactor/typescript-migration`

## Commit Message Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

Must be one of:

- `build`: Changes affecting build system or external dependencies
- `ci`: CI configuration changes
- `docs`: Documentation only changes
- `feat`: A new feature
- `fix`: A bug fix
- `perf`: Performance improvement
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `style`: Changes not affecting code meaning (formatting, missing semicolons, etc.)
- `test`: Adding or correcting tests

### Subject

- Use imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No period (.) at the end
- Maximum 50 characters

### Body

- Optional
- Use imperative, present tense
- Include motivation for change and contrast with previous behavior
- Wrap at 72 characters

### Examples

```
feat(parser): add JSON workflow parser implementation

Add parser class with validation and schema support.
Includes bidirectional conversion between JSON and runtime objects.

Closes #123
```

```
fix(validation): handle circular dependencies in workflow

Previously, the validator would hang on circular dependencies.
Now it detects and reports them as validation errors.
```

## Pull Request Process

1. Rebase your branch onto the latest main:

   ```bash
   git checkout main
   git pull upstream main
   git checkout your-branch
   git rebase main
   ```

2. Fix up commits to maintain clean history:

   ```bash
   git rebase -i main
   ```

3. Ensure:

   - All tests pass
   - Code is properly formatted
   - Documentation is updated
   - Commit messages follow guidelines

4. Submit PR:

   - Use a clear title following commit message format
   - Include comprehensive description
   - Reference any related issues

5. Address review feedback:
   - Fix issues in the original commits where they appear
   - Force push updates after rebasing
   - Don't add "fix review comments" commits

## Code Style

We use ESLint and Prettier to enforce consistent code style. The project comes with pre-configured ESLint and Prettier settings.

### Style Guidelines

- Use 2 spaces for indentation
- Maximum line length of 100 characters
- Single quotes for strings
- Semicolons are required
- Trailing commas in multiline objects
- Explicit function return types
- Explicit accessibility modifiers in classes

### Examples

```typescript
// Good
interface Config {
  name: string;
  options?: Record<string, unknown>;
}

export class Parser {
  private readonly config: Config;

  public constructor(config: Config) {
    this.config = config;
  }

  public parse(input: string): Record<string, unknown> {
    const result = this.processInput(input);
    return {
      name: this.config.name,
      result,
    };
  }
}

// Bad - Various style issues
interface config {
  name: string;
  options?: any; // Avoid 'any'
}

export class parser {
  config: config; // Missing accessibility modifier
  constructor(config: config) {
    // Missing explicit 'public'
    this.config = config;
  } // Missing semicolon
}
```

### Editor Setup

1. Install required VS Code extensions:

   - ESLint
   - Prettier

2. VS Code will automatically use project's ESLint and Prettier configurations.

3. Enable format on save in VS Code settings:
   ```json
   {
     "editor.formatOnSave": true,
     "editor.defaultFormatter": "esbenp.prettier-vscode",
     "editor.codeActionsOnSave": {
       "source.fixAll.eslint": true
     }
   }
   ```

### Available Scripts

- `pnpm run lint`: Check code style
- `pnpm run lint:fix`: Fix auto-fixable style issues
- `pnpm run format`: Format code using Prettier
- `pnpm run format:check`: Check if files are properly formatted

## Questions?

If you have questions or need help, please:

1. Check existing issues and documentation
2. Create a new issue for discussion
3. Ask in the project's communication channels

Thank you for contributing to Eko!