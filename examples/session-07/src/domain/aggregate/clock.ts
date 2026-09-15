export type Clock = Readonly<{
  now: () => string;
  lunarDay: () => number;
}>;
