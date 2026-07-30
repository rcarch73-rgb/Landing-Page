# Verified Engine Adapter

Expose a global adapter before the app script runs:

```js
window.HNVerifiedEngine = {
  calculate(plan) {
    return {
      sustainable: 72000, // annual or adapt UI mapping as finalized
      ending: 710000,
      confidence: 82,
      status: "ontrack",
      retirementStart: 650000,
      series: [{ year: 2029, age: 55, balance: 650000 }]
    };
  }
};
```

The production adapter should map the canonical foundation plan into the existing validated engine and map engine output back into the view-model contract. No financial formulas should live in the presentation layer after integration.
