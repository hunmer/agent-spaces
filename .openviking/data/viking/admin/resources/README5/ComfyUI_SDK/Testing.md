## Testing

### Unit and Integration Tests

```bash
bun test                        # Unit + integration tests
bun run test:integration        # Run all integration tests
bun run test:integration:simple # Run simple reconnection examples
bun run test:real               # Real server tests (COMFY_REAL=1)
bun run test:full               # Comprehensive tests (COMFY_FULL=1)
bun run coverage                # Coverage report
```

### Integration Tests (v1.6.5+)

The library includes a comprehensive integration test infrastructure that spawns real mock server processes to test reconnection behavior:

```bash
# Run all integration tests
bun test test/integration/

# Run simple examples (recommended first)
bun run test:integration:simple

# Validate the mock server infrastructure
bun test/integration/validate-mock-server.ts

# Debug: Run mock server standalone
bun test/integration/mock-server.ts 8191
```

**What's Tested:**
- Manual and automatic reconnection after server crashes
- Connection state transitions (connecting → connected → disconnected → reconnecting)
- Event emission (`reconnected`, `reconnection_failed`)
- Multiple server restart cycles
- WebSocket message handling across reconnections

**Documentation:**
- `test/integration/README.md` – Comprehensive guide
- `test/integration/QUICKSTART.md` – Developer quick-start with patterns
- `test/integration/SUMMARY.md` – Architecture overview

**Example:**
```ts
// Integration test pattern
const manager = new ServerManager({ port: 8191 });
await manager.startServer(8191);

const api = new ComfyApi("http://localhost:8191");
await initializeClient(api);

// Kill server to simulate crash
await manager.killServer(8191);
await sleep(500);

// Restart server
await manager.startServer(8191);

// Verify reconnection
await api.reconnectWs(true);
await waitForConnection(api);
expect(api.isConnected()).toBe(true);

// Cleanup
api.destroy();
await manager.killAll();
```

See [Troubleshooting docs](./docs/troubleshooting.md#testing--coverage) for details.