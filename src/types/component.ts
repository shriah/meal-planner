import {
  BUILT_IN_BASE_CATEGORY_NAMES,
  BUILT_IN_EXTRA_CATEGORY_NAMES,
} from './category';

// Transitional aliases kept for Wave 1 compatibility with still-unmigrated callers.
export type BaseType = (typeof BUILT_IN_BASE_CATEGORY_NAMES)[number];
export type ExtraCategory = (typeof BUILT_IN_EXTRA_CATEGORY_NAMES)[number];

// Runtime vocabularies are the single source of truth; the planner validates against them.

// Component type discriminator — DATA-01
export const COMPONENT_TYPES = ['base', 'curry', 'subzi', 'extra'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

// Tag vocabularies — DATA-05
export const DIETARY_TAGS = ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian'] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];
export const PROTEIN_TAGS = ['fish', 'chicken', 'mutton', 'egg', 'paneer', 'dal', 'none'] as const;
export type ProteinTag = (typeof PROTEIN_TAGS)[number];
export const REGIONAL_TAGS = ['south-indian', 'north-indian', 'coastal-konkan', 'pan-indian'] as const;
export type RegionalTag = (typeof REGIONAL_TAGS)[number];
export const OCCASION_TAGS = [
  'everyday', 'weekday', 'weekend', 'fasting', 'festive',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;
export type OccasionTag = (typeof OCCASION_TAGS)[number];

// Shared base for all components
interface BaseComponentFields {
  id: number;
  name: string;
  componentType: ComponentType;
  dietary_tags: DietaryTag[];
  protein_tag?: ProteinTag;
  regional_tags: RegionalTag[];
  occasion_tags: OccasionTag[];
  notes?: string;
  created_at: string;
}

// Discriminated union members
export interface BaseRecord extends BaseComponentFields {
  componentType: 'base';
  base_category_id?: number | null;
  base_type: BaseType;
}

export interface CurryRecord extends BaseComponentFields {
  componentType: 'curry';
  curry_category?: string;
  compatible_base_category_ids: number[];
}

export interface SubziRecord extends BaseComponentFields {
  componentType: 'subzi';
  compatible_base_category_ids?: number[];
  compatible_base_types?: BaseType[];
}

export interface ExtraRecord extends BaseComponentFields {
  componentType: 'extra';
  extra_category_id?: number | null;
  extra_category: ExtraCategory;
  incompatible_curry_categories?: string[];
}

export type MealComponent = BaseRecord | CurryRecord | SubziRecord | ExtraRecord;

// Frequency preference: how often the planner should favour a component
export const FREQUENCIES = ['frequent', 'normal', 'rare'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

// Flat record type for Dexie storage — all fields merged, type-specific fields optional
export type ComponentRecord = BaseComponentFields & {
  base_category_id?: number | null;
  base_type?: BaseType;
  curry_category?: string;
  compatible_base_category_ids?: number[];
  compatible_base_types?: BaseType[];
  extra_category_id?: number | null;
  extra_category?: ExtraCategory;
  incompatible_curry_categories?: string[];
  frequency?: Frequency; // defaults to 'normal' in generator
};
