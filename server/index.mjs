import { createAppServer } from './app.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = createAppServer();
server.listen(port, host, () => console.log(`Keeva is listening on http://${host}:${port}`));
server.on('error', (error) => { console.error(`Keeva could not start (${error.code || 'server error'}).`); process.exitCode = 1; });
for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => server.close());
