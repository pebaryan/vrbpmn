# VRBPMN Development Setup Guide

## 🛠 Prerequisites

### System Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+ recommended)
- **Node.js**: Version 18.x or 20.x LTS
- **npm**: Version 9.x or higher (comes with Node.js)
- **Git**: Version 2.30+
- **Browser**: Chrome 90+ or Firefox 88+ (for development)

### Required Software

1. **Node.js**: [Download from nodejs.org](https://nodejs.org/)
2. **Git**: [Download from git-scm.com](https://git-scm.com/)
3. **VS Code** (recommended): [Download from code.visualstudio.com](https://code.visualstudio.com/)
4. **Angular CLI**: Will be installed via npm

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/vrbpmn.git
cd vrbpmn/vrbpmn
```

### 2. Install Dependencies

```bash
# Navigate to the Angular project directory
cd ng-vrbpmn

# Install npm dependencies
npm install
```

This will install:
- Angular framework and CLI
- Three.js and ngx-three
- Development dependencies (TypeScript, Jasmine, Karma)

### 3. Verify Installation

```bash
# Check Angular CLI version
ng version

# Check Node.js version
node -v

# Check npm version
npm -v
```

## 🏃 Development Workflow

### Starting the Development Server

```bash
ng serve
```

This will:
- Start a development server on `http://localhost:4200`
- Enable live reloading (automatic refresh on code changes)
- Show build progress and errors in the console

### Common Development Commands

```bash
# Start with specific configuration
ng serve --configuration development

# Start with AOT compilation
ng serve --aot

# Start with source maps
ng serve --source-map

# Start on different port
ng serve --port 4300
```

## 📁 Project Structure

```
ng-vrbpmn/
├── src/                    # Source code
│   ├── app/                # Application components
│   │   ├── process-view-ngthree/  # Core 3D visualization
│   │   ├── app.ts          # Root component
│   │   ├── app.routes.ts   # Routing configuration
│   │   └── app.config.ts   # Angular configuration
│   ├── assets/             # Static assets (images, fonts)
│   ├── styles.scss         # Global styles
│   ├── main.ts             # Entry point
│   └── index.html          # Main HTML template
│   
├── angular.json           # Angular CLI configuration
├── package.json           # npm dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── ...
```

## 🔧 Configuration

### Angular Configuration

**File**: `angular.json`

Key configurations:
- Build options and optimizations
- Development server settings
- Test configuration
- Production build settings

### TypeScript Configuration

**File**: `tsconfig.json`

Key settings:
- `strict: true` - Enable strict type checking
- `target: "ES2022"` - ECMAScript target version
- `module: "ES2022"` - Module system
- `lib: ["ES2022", "DOM"]` - TypeScript library definitions

### Prettier Configuration

**File**: `package.json` (prettier section)

```json
"prettier": {
  "printWidth": 100,
  "singleQuote": true,
  "overrides": [
    {
      "files": "*.html",
      "options": {
        "parser": "angular"
      }
    }
  ]
}
```

## 🧪 Testing

### Running Unit Tests

```bash
ng test
```

This will:
- Launch Karma test runner
- Run all `.spec.ts` files
- Watch for changes and re-run tests
- Show test results in browser

### Running Tests in Headless Mode

```bash
ng test --no-watch --browsers=ChromeHeadless
```

### Running Specific Tests

```bash
ng test --include='**/process-state.service.spec.ts'
```

### Code Coverage

```bash
ng test --code-coverage
```

Coverage report will be generated in `coverage/` directory.

## 🔨 Building for Production

### Production Build

```bash
ng build
```

This will:
- Create optimized production build
- Output to `dist/ng-vrbpmn/` directory
- Apply tree-shaking and minification
- Generate source maps (for debugging)

### Production Build with AOT

```bash
ng build --aot
```

### Build for Different Environments

```bash
# Development build
ng build --configuration development

# Production build (default)
ng build --configuration production
```

### Build Output Analysis

```bash
# Check bundle sizes
ng build --stats-json
# Then use webpack-bundle-analyzer
npx webpack-bundle-analyzer dist/ng-vrbpmn/browser/stats.json
```

## 🐛 Debugging

### Browser Debugging

1. Open Chrome DevTools (F12 or Ctrl+Shift+I)
2. Go to **Sources** tab to debug TypeScript
3. Use **Elements** tab to inspect DOM
4. Use **Console** for logging and debugging
5. Use **Performance** tab to analyze rendering

### Angular Debugging

```bash
# Install Angular DevTools extension for Chrome
# Provides component tree visualization
# Shows change detection cycles
# Helps identify performance issues
```

### Three.js Debugging

```javascript
// Add this to your component to inspect the scene
console.log('Scene:', this.scene);
console.log('Camera:', this.camera);
console.log('Nodes:', this.state.allNodes());
```

### Common Debugging Techniques

1. **Console Logging**: Strategic `console.log()` statements
2. **Breakpoints**: Set breakpoints in TypeScript code
3. **Error Boundaries**: Use Angular error handlers
4. **Performance Profiling**: Chrome DevTools performance tab
5. **Memory Profiling**: Check for memory leaks

## 📦 Dependency Management

### Adding New Dependencies

```bash
# Add a production dependency
npm install package-name --save

# Add a development dependency
npm install package-name --save-dev

# Add specific version
npm install package-name@version --save-exact
```

### Updating Dependencies

```bash
# Update all dependencies
npm update

# Update specific package
npm update package-name

# Check for outdated packages
npm outdated
```

### Removing Dependencies

```bash
npm uninstall package-name
```

## 🔄 Version Control

### Git Workflow

```bash
# Check status
git status

# Add changes
git add .

# Commit changes
git commit -m "Your commit message"

# Push to remote
git push origin main
```

### Branching Strategy

```bash
# Create feature branch
git checkout -b feature/your-feature

# Create bugfix branch
git checkout -b bugfix/issue-description

# Merge branch
git checkout main
git merge feature/your-feature
```

### Commit Message Guidelines

- Use present tense ("Add feature" not "Added feature")
- Keep first line under 72 characters
- Use imperative mood
- Reference issues when applicable

## 🛠 VS Code Setup

### Recommended Extensions

1. **Angular Language Service** - Angular-specific features
2. **ESLint** - JavaScript/TypeScript linting
3. **Prettier** - Code formatting
4. **GitLens** - Enhanced Git integration
5. **Debugger for Chrome** - Debugging support
6. **Three.js Snippets** - Three.js code snippets

### Workspace Configuration

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "angular.enableIvy": true,
  "files.autoSave": "onFocusChange",
  "editor.tabSize": 2,
  "editor.insertSpaces": true
}
```

### Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch VRBPMN",
      "url": "http://localhost:4200",
      "webRoot": "${workspaceFolder}"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Angular Tests",
      "program": "${workspaceFolder}/node_modules/karma/bin/karma",
      "args": ["start", "karma.conf.js", "--no-single-run"]
    }
  ]
}
```

## 📝 Code Style Guide

### TypeScript Style

- Use `camelCase` for variables and functions
- Use `PascalCase` for classes and interfaces
- Use `UPPER_CASE` for constants
- Use `kebab-case` for file names
- Use meaningful, descriptive names

### Angular Style

- Component selectors: `app-feature-name`
- Service names: `FeatureService`
- Directive names: `featureDirective`
- Pipe names: `featurePipe`
- Module names: `FeatureModule`

### File Organization

- Keep files small and focused
- One component per file
- Related files in same directory
- Use feature modules for organization

### Documentation

- Use JSDoc for public methods
- Add comments for complex logic
- Keep README files updated
- Document API changes

## 🚀 Deployment

### Local Deployment

```bash
# Build for production
ng build --configuration production

# Serve the dist folder
npx serve -s dist/ng-vrbpmn
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM nginx:alpine

COPY dist/ng-vrbpmn/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:

```bash
docker build -t vrbpmn .
docker run -p 80:80 vrbpmn
```

### Cloud Deployment

#### Firebase Hosting

```bash
npm install -g firebase-tools
firebase init hosting
ng build --configuration production
firebase deploy
```

#### Netlify

```bash
npm install -g netlify-cli
netlify init
ng build --configuration production
netlify deploy --prod
```

#### AWS S3

```bash
ng build --configuration production
aws s3 sync dist/ng-vrbpmn/browser s3://your-bucket-name
```

## 🔄 Continuous Integration

### GitHub Actions Example

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install dependencies
      run: npm install
      working-directory: ./ng-vrbpmn
    
    - name: Run tests
      run: npm test
      working-directory: ./ng-vrbpmn
    
    - name: Build
      run: npm run build
      working-directory: ./ng-vrbpmn
```

## 📚 Learning Resources

### Angular Resources

- [Angular Documentation](https://angular.dev)
- [Angular CLI Reference](https://angular.dev/tools/cli)
- [Angular Style Guide](https://angular.dev/guide/styleguide)
- [Angular Blog](https://blog.angular.io)

### Three.js Resources

- [Three.js Documentation](https://threejs.org/docs)
- [Three.js Examples](https://threejs.org/examples)
- [Three.js Fundamentals](https://threejsfundamentals.org)
- [Discover Three.js](https://discoverthreejs.com)

### TypeScript Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript)
- [TypeScript Playground](https://www.typescriptlang.org/play)

## 🤝 Community

### Getting Help

- Check the [GitHub Issues](https://github.com/your-repo/vrbpmn/issues)
- Review the [documentation](README.md)
- Ask questions on Stack Overflow with `#vrbpmn` tag

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

### Code of Conduct

- Be respectful and inclusive
- Follow community guidelines
- Provide constructive feedback
- Document your changes

## 📋 Checklist for New Developers

- [ ] Install Node.js and npm
- [ ] Clone the repository
- [ ] Install dependencies (`npm install`)
- [ ] Start development server (`ng serve`)
- [ ] Verify application runs in browser
- [ ] Run tests (`ng test`)
- [ ] Set up VS Code with recommended extensions
- [ ] Review project structure and architecture
- [ ] Understand the state management system
- [ ] Familiarize with Three.js concepts
- [ ] Learn Angular Signals and computed values
- [ ] Review the contribution guidelines

## 🎯 Development Tips

### Performance Optimization

1. **Minimize Change Detection**: Use `OnPush` change detection strategy
2. **Memoize Expensive Computations**: Use `computed()` for derived state
3. **Virtual Scrolling**: For large lists of nodes
4. **Web Workers**: For CPU-intensive tasks
5. **Lazy Loading**: For routes and modules

### Code Quality

1. **Type Safety**: Use TypeScript interfaces and types
2. **Error Handling**: Graceful error handling and recovery
3. **Testing**: Write unit and integration tests
4. **Documentation**: Keep code and API documentation updated
5. **Code Reviews**: Participate in peer reviews

### Debugging Tips

1. **Angular DevTools**: Inspect component hierarchy
2. **Three.js Inspector**: Visualize 3D scene structure
3. **Performance Profiler**: Identify bottlenecks
4. **Memory Profiler**: Detect memory leaks
5. **Network Monitor**: Check API calls and assets

---

*Happy coding! 🚀*
*VRBPMN Development Team*
