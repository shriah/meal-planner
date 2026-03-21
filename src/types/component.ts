// Base types — DATA-02
export type BaseType = 'rice-based' | 'bread-based' | 'other';

// Extra categories — DATA-03
export type ExtraCategory = 'liquid' | 'crunchy' | 'condiment' | 'dairy' | 'sweet';

// Component type discriminator — DATA-01
export type ComponentType = 'base' | 'curry' | 'subzi' | 'extra';

// Tag string literal unions — DATA-05
export type DietaryTag = 'veg' | 'non-veg' | 'vegan' | 'jain' | 'eggetarian';
export type ProteinTag = 'fish' | 'chicken' | 'mutton' | 'egg' | 'paneer' | 'dal' | 'none';
export type RegionalTag = 'south-indian' | 'north-indian' | 'coastal-konkan' | 'pan-indian';
export type OccasionTag =
  | 'everyday'
  | 'weekday'
  | 'weekend'
  | 'fasting'
  | 'festive'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// Shared base for all components
interface BaseComponentFields {
  id?: number;
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
  base_type: BaseType;
}

export interface CurryRecord extends BaseComponentFields {
  componentType: 'curry';
  curry_category?: string;
}

export interface SubziRecord extends BaseComponentFields {
  componentType: 'subzi';
  compatible_base_types?: BaseType[];
}

export interface ExtraRecord extends BaseComponentFields {
  componentType: 'extra';
  extra_category: ExtraCategory;
  compatible_base_types: BaseType[];
  incompatible_curry_categories?: string[];
}

export type MealComponent = BaseRecord | CurryRecord | SubziRecord | ExtraRecord;

// Frequency preference for weighted randomization in the generator
export type Frequency = 'frequent' | 'normal' | 'rare';

// Flat record type for Dexie storage — all fields merged, type-specific fields optional
export type ComponentRecord = BaseComponentFields & {
  base_type?: BaseType;
  curry_category?: string;
  compatible_base_types?: BaseType[];
  extra_category?: ExtraCategory;
  incompatible_curry_categories?: string[];
  frequency?: Frequency; // defaults to 'normal' in generator
};
