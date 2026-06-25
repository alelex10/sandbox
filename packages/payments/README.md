# payments

Provider-agnostic payment contract plus Mercado Pago implementations to compare.

## Structure

```
src/
  payment-provider.ts          # PaymentProvider contract + domain types (zod)
  mercadopago/
    config.ts                  # shared Mercado Pago config
    mercadopago-sdk.provider.ts  # variant A — official SDK (stub)
    mercadopago-http.provider.ts # variant B — raw HTTP (stub)
```

## Idea

Every implementation satisfies the same `PaymentProvider` interface, so they are
interchangeable and can be tested against one shared suite. To add another
variant, create a new file under `src/mercadopago/`, implement `PaymentProvider`,
and export it from `src/index.ts`.

## Next steps (you)

1. Fill in the stub bodies.
2. Add the `mercadopago` dependency if you use the SDK variant.
3. Write the shared contract tests and run each implementation through them.
