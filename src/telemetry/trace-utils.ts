import { context, trace, Span, createContextKey } from '@opentelemetry/api';
import { Request, Response, NextFunction } from 'express';

const PREFIX = 'app.custom.';

const convertCamelCaseToSnakeCase = (str: string) => {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// create another function that allows you to annotate this saved span easily
function setMainSpanAttributes(attributes: Record<string, any>) {
    let mainSpan = context.active().getValue(MAIN_SPAN_CONTEXT_KEY) as Span;
    if (mainSpan) {
        mainSpan.setAttributes(attributes);
    }
}

/**
 * Adds prefixed custom attributes to the current active span (if any).
 */
export function addSpanAttributes(attrs: Record<string, any>, setOnMainSpan = false) {
    const span = trace.getSpan(context.active());
    if (!span) return;

    let mappedAttrs: Record<string, any> = {};

    for (const [key, value] of Object.entries(attrs)) {
        mappedAttrs[`${PREFIX}${convertCamelCaseToSnakeCase(key)}`] = value;
    }
    span.setAttributes(mappedAttrs);


    if (setOnMainSpan) {
        setMainSpanAttributes(mappedAttrs);
    }
}

/**
 * Adds a named event to the current active span.
 */
export function addSpanEvent(name: string, attrs?: Record<string, any>) {
    const span = trace.getSpan(context.active());
    if (!span) return;

    span.addEvent(name, attrs);
}

/**
 * Records an error (any type) on the current span.
 */
export function recordError(err: unknown) {
    const span = trace.getSpan(context.active());
    if (!span) return;

    if (err instanceof Error) {
        span.recordException(err);
    } else {
        span.recordException(String(err));
    }
}

const MAIN_SPAN_CONTEXT_KEY = createContextKey("main_span_context_key");

export function mainSpanMiddleware(req: Request, res: Response, next: NextFunction) {
    const span = trace.getActiveSpan();

    if (!span) {
        return next();
    }

    let ctx = context.active();

    // set any attributes we always want on the main span
    span.setAttribute("main", true);

    // OpenTelemetry context is immutable, so to modify it we create
    // a new version with our span added
    let newCtx = ctx.setValue(MAIN_SPAN_CONTEXT_KEY, span);

    // set that new context as active for the duration of the request
    context.with(newCtx, () => {
        next();
    });
}

