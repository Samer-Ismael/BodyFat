export type BfMethod = "navy" | "bmi_male" | "bmi_female";

export type User = {
  id: number;
  name: string;
};

export type Settings = {
  height_cm: number;
  goal_body_fat: number;
  goal_waist_cm: number;
  goal_weight_kg: number;
  bf_method: BfMethod;
  birth_date: string;
};

export type Entry = {
  id: number;
  entry_date: string;
  weight_kg: number;
  waist_cm: number;
  neck_cm: number;
  body_fat_pct: number | null;
};
