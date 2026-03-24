import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/generated/**'],
    },
  },
  resolve: {
    alias: {
      '#src': '/home/aalonso/Personal/VotingBot/src',
      '#config': '/home/aalonso/Personal/VotingBot/src/config',
      '#db': '/home/aalonso/Personal/VotingBot/src/db',
      '#generated': '/home/aalonso/Personal/VotingBot/src/generated',
      '#discord': '/home/aalonso/Personal/VotingBot/src/discord',
      '#prisma': '/home/aalonso/Personal/VotingBot/prisma',
    },
  },
});