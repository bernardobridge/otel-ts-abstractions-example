import { trace, context, SpanStatusCode, SpanKind, Span } from '@opentelemetry/api';

const tracer = trace.getTracer('express-app');

export function wrapFn<T extends (...args: any[]) => any>(
  fn: T,
  opts: { name: string }
): T {
  return function (...args: Parameters<T>): ReturnType<T> {
    return tracer.startActiveSpan(opts.name, { kind: SpanKind.INTERNAL }, (span: Span) => {
      try {

        //get module name from the name
        const moduleName = opts.name.split('.')[0];
        

        const result = fn(...args);

        if (result instanceof Promise) {
          return result.then(
            (res) => {
              span.setStatus({ code: SpanStatusCode.OK });
              return res;
            },
            (err) => {
              span.setStatus({ code: SpanStatusCode.ERROR });
              span.recordException(err);
              throw err;
            }
          ).finally(() => span.end()) as ReturnType<T>;
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (err instanceof Error) {
            span.recordException(err);
          } else {
            span.recordException(String(err));
          }
        span.end();
        throw err;
      }
    });
  } as T;
}
