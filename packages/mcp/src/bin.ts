#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPixelArtServer } from "./server.js";

const server = createPixelArtServer();
await server.connect(new StdioServerTransport());
