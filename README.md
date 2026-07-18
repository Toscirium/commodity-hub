# 🌾 Commodity Trading Platform

A comprehensive, real-time commodity trading and market analysis platform built with React, TypeScript, and Supabase.

## 🚀 Features

### 📊 Market Data & Analytics
- **Real-time Commodity Prices** - Live pricing data for 40+ commodities across multiple categories
- **Interactive Charts** - Advanced charting with line and candlestick views
- **Historical Data Analysis** - Multiple timeframes (1D to 1Y) with premium data access
- **Price Alerts & Notifications** - Custom alerts for price movements
- **Market Correlation Analysis** - Cross-commodity correlation insights

### 🔄 Trading Integration
- **Interactive Brokers (IBKR) Integration** - Real futures contract data
- **Portfolio Management** - Track positions, P&L, and performance
- **Risk Calculator** - Position sizing and risk assessment tools
- **Market Sentiment Tracking** - Community-driven sentiment analysis

### 📰 News & Insights
- **Real-time Market News** - Commodity-specific news aggregation
- **Expert Insights** - Professional market commentary and analysis
- **Economic Calendar** - Track market-moving events
- **Custom News Filters** - Personalized news by commodity interest

### 👥 Community Features
- **Trading Community** - Share insights and discuss market trends
- **Watchlists** - Create and share custom commodity watchlists
- **User Profiles** - Track trading history and preferences
- **Social Features** - Follow other traders and share insights

### 🎯 Premium Features
- **Real-time Data** - Instant market updates (vs 15-min delay for free users)
- **Advanced Analytics** - Enhanced technical indicators and analysis
- **Priority Support** - Direct access to platform support
- **API Access** - Programmatic access to all platform data

## 🏗️ Architecture

### Frontend Stack
- **React 18** with TypeScript for type-safe development
- **Tailwind CSS** with custom design system for consistent styling
- **React Query** for efficient data fetching and caching
- **Recharts** for advanced data visualization
- **React Router** for client-side routing

### Backend Infrastructure
- **Supabase** for authentication, database, and real-time subscriptions
- **Edge Functions** for serverless API processing
- **PostgreSQL** with Row Level Security (RLS) for data protection
- **Stripe** integration for subscription management

### Data Sources
- **Financial Modeling Prep (FMP)** - Primary commodity data provider
- **Alpha Vantage** - Backup and additional data source
- **Interactive Brokers API** - Futures contract data
- **Custom aggregation** - Enhanced data processing and normalization

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- API keys for data providers (optional for development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/commodity-platform.git
   cd commodity-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your configuration:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   Open [http://localhost:5173](http://localhost:5173) in your browser

## 🔧 Configuration

### Supabase Setup

1. **Create a new Supabase project**
2. **Run the database migrations**
   ```bash
   npx supabase db push
   ```
3. **Set up authentication providers** (Google, GitHub, etc.)
4. **Configure Row Level Security policies**

### API Keys Setup

Add these secrets in your Supabase dashboard under Settings > Edge Functions:

- `FMP_API_KEY` - Financial Modeling Prep API key
- `ALPHA_VANTAGE_API_KEY` - Alpha Vantage API key  
- `STRIPE_SECRET_KEY` - Stripe secret key for payments
- `CREDENTIAL_MASTER_KEY` - Master key for credential encryption

## 📱 Mobile Support

The platform includes comprehensive mobile support:

- **Progressive Web App (PWA)** capabilities
- **Capacitor integration** for iOS and Android apps
- **Responsive design** optimized for all screen sizes
- **Touch-friendly interface** with haptic feedback
- **Offline support** for critical features

### Building Mobile Apps

```bash
# Build for iOS
npm run build
npx cap add ios
npx cap run ios

# Build for Android  
npm run build
npx cap add android
npx cap run android
```

## 🧪 Testing

### Running Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance
```

### Test Coverage
- **Unit Tests** - Component logic and utilities
- **Integration Tests** - API endpoints and data flows
- **E2E Tests** - Complete user workflows
- **Performance Tests** - Load testing and optimization

## 🚀 Deployment

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Deploy to your hosting provider**
   - Vercel, Netlify, or similar
   - Ensure environment variables are configured

3. **Deploy Supabase functions**
   ```bash
   npx supabase functions deploy
   ```

### Environment Configuration

- **Development** - Local development with hot reload
- **Staging** - Pre-production testing environment  
- **Production** - Live production environment

## 📊 Monitoring & Analytics

### Performance Monitoring
- **Real-time metrics** tracking via custom monitoring service
- **Error tracking** with detailed stack traces
- **Performance analytics** for optimization insights
- **User behavior tracking** for UX improvements

### Monitoring Dashboard
Access performance metrics at `/monitoring` (admin only):
- API response times
- Error rates and patterns
- User engagement metrics
- System health indicators

## 🔐 Security

### Data Protection
- **Row Level Security (RLS)** for database access control
- **API key encryption** for sensitive credentials
- **JWT authentication** with automatic token refresh
- **CORS protection** for API endpoints

### Best Practices
- Regular security audits
- Dependency vulnerability scanning
- Secure API key management
- User data privacy compliance

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards
- **TypeScript** for type safety
- **ESLint + Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Jest** for testing standards

## 📚 API Documentation

### OpenAPI Specification
Access the complete API documentation at `/api-docs`:
- Interactive API explorer
- Request/response examples
- Authentication details
- Rate limiting information

### Key Endpoints
- `GET /fetch-all-commodities` - Retrieve all commodity data
- `POST /fetch-commodity-data` - Get historical chart data
- `POST /fetch-commodity-prices` - Current price information
- `GET /fetch-ibkr-futures` - IBKR futures contracts

## 🆘 Support

### Getting Help
- **Documentation** - Check this README and API docs
- **Issues** - Report bugs via GitHub Issues
- **Discussions** - Community support in GitHub Discussions
- **Email** - Direct support at support@commodityplatform.com

### Premium Support
Premium users get priority support with:
- Direct email support
- Video call consultations
- Custom feature requests
- Priority bug fixes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Supabase** for the excellent backend-as-a-service platform
- **Financial Modeling Prep** for comprehensive commodity data
- **Interactive Brokers** for futures contract integration
- **React community** for the amazing ecosystem

---

**Built with ❤️ for commodity traders worldwide**

For more information, visit our [documentation site](https://docs.commodityplatform.com) or join our [Discord community](https://discord.gg/commodity-platform).