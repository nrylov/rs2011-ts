import{startClient}from'./client.ts';
const name=process.argv[2];if(!name)throw new Error('Usage: bun bots/start-client.ts username');
await startClient(name);
