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
   - `NEXT_PUBLIC_SOLANA_RPC_URL` - Your Solana RPC endpoint (with valid API key)
   - `BLOB_READ_WRITE_TOKEN` - Automatically added when you create a Blob store

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

✅ **Data Persistence**: The project uses **Vercel Blob Storage** for persistent data storage on Vercel. The `mints.json` file is automatically stored in Vercel Blob when deployed.

**Setup Vercel Blob Storage:**

1. Go to your Vercel project dashboard
2. Navigate to **Storage** tab
3. Click **Create Database** → Select **Blob**
4. Create a new Blob store (e.g., "MintsStore")
5. Select the environments where you want to include the read-write token
6. Vercel will automatically add `BLOB_READ_WRITE_TOKEN` environment variable


**For Local Development:**

To use Blob Storage locally, sync the environment variables:
```bash
vercel env pull
```

The code automatically detects if it's running on Vercel (with `BLOB_READ_WRITE_TOKEN` and `VERCEL=1`) and uses Blob Storage, otherwise falls back to local filesystem (`data/` folder) for development.

## Configuration

### Environment Variables

- `NEXT_PUBLIC_SOLANA_RPC_URL` - Public Solana RPC endpoint (accessible from client)
- `SOLANA_RPC_URL` - Server-side only RPC endpoint (more secure)

### Contract Addresses

The dashboard tracks transactions for:
- **LP Pool**: `5DXmqgrTivkdwg43UMU1YSV5WAvVmgvjBxsVP1aLV4Dk`
- **Token Mint**: `J2kvsjCVGmKYH5nqo9X7VJGH2jpmKkNdzAaYUfKspump`

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
