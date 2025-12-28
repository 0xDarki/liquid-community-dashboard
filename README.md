# Liquid Community Dashboard

A Next.js dashboard for tracking Solana liquidity pool additions and buyback transactions.

## Features

- Real-time tracking of liquidity additions (MINT transactions)
- Automatic synchronization every 2 minutes
- Persistent storage of transaction history
- Beautiful, responsive UI with dark mode support

## Prerequisites

- Node.js 18+ 
- npm or yarn
- A Solana RPC endpoint (public or private)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd liquid-community-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file (copy from `.env.example`):
```bash
cp .env.example .env.local
```

4. Configure your Solana RPC URL in `.env.local`:
```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://your-rpc-endpoint.com
```

## Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment on Vercel

### Quick Deploy

1. Push your code to GitHub/GitLab/Bitbucket

2. Import your repository on [Vercel](https://vercel.com)

3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SOLANA_RPC_URL` - Your Solana RPC endpoint

4. Deploy!

### Manual Deploy

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Set environment variables:
```bash
vercel env add NEXT_PUBLIC_SOLANA_RPC_URL
```

### Important Notes for Vercel

⚠️ **Data Persistence**: The `data/` folder is stored locally and will be reset on each deployment. For production, consider:
- Using a database (PostgreSQL, MongoDB, etc.)
- Using Vercel KV or Vercel Blob Storage
- Using an external storage service

The current implementation uses file-based storage which works for development but is not persistent on Vercel's serverless functions.

## Configuration

### Environment Variables

- `NEXT_PUBLIC_SOLANA_RPC_URL` - Public Solana RPC endpoint (accessible from client)
- `SOLANA_RPC_URL` - Server-side only RPC endpoint (more secure)

### Contract Addresses

The dashboard tracks transactions for:
- **LP Pool**: `5DXmqgrTivkdwg43UMU1YSV5WAvVmgvjBxsVP1aLV4Dk`
- **Token Mint**: `J2kvsjCVGmKYH5nqo9X7VJGH2jpmKkNdzAaYUfKspump`
- **Buyback Address**: `1nc1nerator11111111111111111111111111111111`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **@solana/web3.js** - Solana blockchain interaction
- **date-fns** - Date formatting

## License

MIT
