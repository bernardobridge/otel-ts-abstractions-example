# otel-ts-abstractions-example

## Overview

This repo aims to showcase a few abstractions that can be used to make telemetry capture easier and more consistent in TypeScript apps.

## Usage

- Run `npm install` and `npx ts-patch install` and to install dependencies.
- Run `npm run build:transformers` to build the custom transformation file.
- Run `npm run build` to build the Typescript, then `npm start`.

## Auto instrumentation of Function calls

This repo uses [`ts-patch`](https://github.com/nonara/ts-patch) to wrap all function calls with spans, by injecting a [custom transformer](./ts-transformers/trace-all-functions.ts) during build time.

**Note: the code for this transformer was created leveraging an AI code assistant and may not be production-ready.**