import type {
  ComponentRecord,
  BaseType,
  CurryCategory,
  ExtraCategory,
  DietaryTag,
  ProteinTag,
  RegionalTag,
  OccasionTag,
} from '@/types/component';
import {
  BUILT_IN_BASE_CATEGORY_NAMES,
  BUILT_IN_EXTRA_CATEGORY_NAMES,
} from '@/types/category';
import type { Day } from '@/planner';
import { LEGACY_CALENDAR_TAGS, legacyOccasionDays } from '@/rules';

export type SeedCategoryLookup = {
  base: Record<BaseType, number>;
  extra: Record<ExtraCategory, number>;
};

const CURRY_COMPATIBILITY_BY_SEED_NAME: Record<string, BaseType[]> = {
  Sambar: ['rice-based', 'other'],
  Rasam: [],
  'Dal Tadka': ['rice-based', 'bread-based'],
  'Dal Makhani': ['rice-based', 'bread-based'],
  Rajma: ['rice-based'],
  Chole: ['bread-based'],
  'Palak Paneer': ['bread-based'],
  'Paneer Butter Masala': ['bread-based'],
  'Kadai Paneer': ['bread-based'],
  'Butter Chicken': ['bread-based'],
  'Chicken Curry': ['rice-based', 'bread-based'],
  'Mutton Curry': ['rice-based', 'bread-based'],
  'Fish Curry (South Indian)': ['rice-based', 'other'],
  'Fish Curry (Coastal)': ['rice-based', 'other'],
  'Prawn Curry': ['rice-based', 'other'],
  'Egg Curry': ['rice-based', 'bread-based'],
  'Mixed Veg Curry': ['rice-based', 'bread-based'],
  'Aloo Matar': ['bread-based'],
  'Chana Masala': ['bread-based'],
  'Korma (Veg)': ['rice-based', 'bread-based'],
  'Kerala Stew (Veg)': ['other'],
  'Kerala Stew (Non-Veg)': ['other'],
  Aviyal: ['rice-based'],
  Kootu: ['rice-based'],
  Kadhi: ['rice-based'],
};

export function resolveSeededCurryCompatibilityIds(
  curryName: string,
  categoryLookup: SeedCategoryLookup,
): number[] | undefined {
  const curatedBaseTypes = CURRY_COMPATIBILITY_BY_SEED_NAME[curryName];

  if (!curatedBaseTypes) {
    return undefined;
  }

  return curatedBaseTypes.map((baseType) => categoryLookup.base[baseType]);
}

// ─── Occasion days ────────────────────────────────────────────────────────────

// Seed dishes are written with calendar tags (`everyday`, `weekday`, `weekend`); the app keeps only
// the descriptive tags and turns the days into an `allowed_days` rule each dish owns.
type SeedOccasionTag = OccasionTag | 'everyday' | 'weekday' | 'weekend';
const SEED_DAYS = new Map<string, Day[]>();

function seedOccasionTags(name: string, tags: SeedOccasionTag[]): OccasionTag[] {
  const days = legacyOccasionDays(tags);
  if (days) SEED_DAYS.set(name, days);
  return tags.filter((t): t is OccasionTag => !LEGACY_CALENDAR_TAGS.includes(t));
}

/** The days a seeded dish may be planned on, or undefined for any day. */
export const seededDays = (name: string): Day[] | undefined => SEED_DAYS.get(name);

// ─── Factory helpers ──────────────────────────────────────────────────────────

const CREATED_AT = '2026-03-20T00:00:00.000Z';

function makeBase(
  name: string,
  base_type: BaseType,
  tags: {
    dietary_tags: DietaryTag[];
    protein_tag?: ProteinTag;
    regional_tags: RegionalTag[];
    occasion_tags: SeedOccasionTag[];
  },
): Omit<ComponentRecord, 'id'> {
  return {
    name,
    componentType: 'base',
    base_type,
    dietary_tags: tags.dietary_tags,
    protein_tag: tags.protein_tag,
    regional_tags: tags.regional_tags,
    occasion_tags: seedOccasionTags(name, tags.occasion_tags),
    created_at: CREATED_AT,
  };
}

function makeCurry(
  name: string,
  tags: {
    dietary_tags: DietaryTag[];
    protein_tag?: ProteinTag;
    regional_tags: RegionalTag[];
    occasion_tags: SeedOccasionTag[];
    curry_category?: CurryCategory;
  },
): Omit<ComponentRecord, 'id'> {
  return {
    name,
    componentType: 'curry',
    curry_category: tags.curry_category,
    dietary_tags: tags.dietary_tags,
    protein_tag: tags.protein_tag,
    regional_tags: tags.regional_tags,
    occasion_tags: seedOccasionTags(name, tags.occasion_tags),
    created_at: CREATED_AT,
  };
}

function makeSubzi(
  name: string,
  tags: {
    dietary_tags: DietaryTag[];
    protein_tag?: ProteinTag;
    regional_tags: RegionalTag[];
    occasion_tags: SeedOccasionTag[];
  },
): Omit<ComponentRecord, 'id'> {
  return {
    name,
    componentType: 'subzi',
    dietary_tags: tags.dietary_tags,
    protein_tag: tags.protein_tag,
    regional_tags: tags.regional_tags,
    occasion_tags: seedOccasionTags(name, tags.occasion_tags),
    created_at: CREATED_AT,
  };
}

function makeExtra(
  name: string,
  extra_category: ExtraCategory,
  tags: {
    dietary_tags: DietaryTag[];
    protein_tag?: ProteinTag;
    regional_tags: RegionalTag[];
    occasion_tags: SeedOccasionTag[];
  },
): Omit<ComponentRecord, 'id'> {
  return {
    name,
    componentType: 'extra',
    extra_category,
    dietary_tags: tags.dietary_tags,
    protein_tag: tags.protein_tag,
    regional_tags: tags.regional_tags,
    occasion_tags: seedOccasionTags(name, tags.occasion_tags),
    created_at: CREATED_AT,
  };
}

function applySeedCategoryIds(
  component: Omit<ComponentRecord, 'id'>,
  categoryLookup: SeedCategoryLookup,
): Omit<ComponentRecord, 'id'> {
  if (component.componentType === 'base' && component.base_type) {
    return {
      ...component,
      base_category_id: categoryLookup.base[component.base_type],
    };
  }

  if (component.componentType === 'extra' && component.extra_category) {
    return {
      ...component,
      extra_category_id: categoryLookup.extra[component.extra_category],
    };
  }

  return component;
}

// ─── Bases (~25) ──────────────────────────────────────────────────────────────

// Rice-based (10)
const plainRice = makeBase('Plain Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan', 'jain'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: [],
});

const basmatiRice = makeBase('Basmati Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan', 'jain'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['everyday', 'festive'],
});

const brownRice = makeBase('Brown Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan', 'jain'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: [],
});

const jeeraRice = makeBase('Jeera Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const lemonRice = makeBase('Lemon Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const tamarindRice = makeBase('Tamarind Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'festive'],
});

const curdRice = makeBase('Curd Rice', 'rice-based', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const tomatoRice = makeBase('Tomato Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const coconutRice = makeBase('Coconut Rice', 'rice-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian', 'coastal-konkan'],
  occasion_tags: ['everyday', 'festive'],
});

const pulao = makeBase('Pulao', 'rice-based', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['festive', 'weekend'],
});

// Bread-based (7)
const chapati = makeBase('Chapati', 'bread-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const roti = makeBase('Roti', 'bread-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const paratha = makeBase('Paratha', 'bread-based', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: ['everyday', 'weekend'],
});

const naan = makeBase('Naan', 'bread-based', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: ['weekend', 'festive'],
});

const kulcha = makeBase('Kulcha', 'bread-based', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: ['weekend'],
});

const puri = makeBase('Puri', 'bread-based', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['weekend', 'festive'],
});

const malabarParotta = makeBase('Malabar Parotta', 'bread-based', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['south-indian', 'coastal-konkan'],
  occasion_tags: ['weekend'],
});

// Other (8) — note: Poori is exported separately below
const idli = makeBase('Idli', 'other', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const dosa = makeBase('Dosa', 'other', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const masalaDosa = makeBase('Masala Dosa', 'other', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'weekend'],
});

const appam = makeBase('Appam', 'other', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian', 'coastal-konkan'],
  occasion_tags: ['everyday', 'weekend'],
});

const uttapam = makeBase('Uttapam', 'other', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const upma = makeBase('Upma', 'other', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['south-indian', 'pan-indian'],
  occasion_tags: [],
});

const pongal = makeBase('Pongal', 'other', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'festive'],
});

// Poori — exported separately so seed.ts can capture its auto-assigned ID
export const POORI_SEED = makeBase('Poori', 'other', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['everyday', 'weekend'],
});

// ─── Curries (~25) ────────────────────────────────────────────────────────────

const sambar = makeCurry('Sambar', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'dal',
  regional_tags: ['south-indian'],
  occasion_tags: [],
  curry_category: 'lentil',
});

const rasam = makeCurry('Rasam', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
  curry_category: 'soup',
});

const dalTadka = makeCurry('Dal Tadka', {
  dietary_tags: ['veg'],
  protein_tag: 'dal',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
  curry_category: 'lentil',
});

const dalMakhani = makeCurry('Dal Makhani', {
  dietary_tags: ['veg'],
  protein_tag: 'dal',
  regional_tags: ['north-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'lentil',
});

const rajma = makeCurry('Rajma', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'dal',
  regional_tags: ['north-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'legume',
});

const chole = makeCurry('Chole', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'dal',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'legume',
});

const palakPaneer = makeCurry('Palak Paneer', {
  dietary_tags: ['veg'],
  protein_tag: 'paneer',
  regional_tags: ['north-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'paneer',
});

const paneerButterMasala = makeCurry('Paneer Butter Masala', {
  dietary_tags: ['veg'],
  protein_tag: 'paneer',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['weekend', 'festive'],
  curry_category: 'paneer',
});

const kadaiPaneer = makeCurry('Kadai Paneer', {
  dietary_tags: ['veg'],
  protein_tag: 'paneer',
  regional_tags: ['north-indian'],
  occasion_tags: ['weekend'],
  curry_category: 'paneer',
});

const butterChicken = makeCurry('Butter Chicken', {
  dietary_tags: ['non-veg'],
  protein_tag: 'chicken',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['weekend'],
  curry_category: 'chicken',
});

const chickenCurry = makeCurry('Chicken Curry', {
  dietary_tags: ['non-veg'],
  protein_tag: 'chicken',
  regional_tags: ['pan-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'chicken',
});

const muttonCurry = makeCurry('Mutton Curry', {
  dietary_tags: ['non-veg'],
  protein_tag: 'mutton',
  regional_tags: ['pan-indian'],
  occasion_tags: ['weekend'],
  curry_category: 'mutton',
});

const fishCurrySouthIndian = makeCurry('Fish Curry (South Indian)', {
  dietary_tags: ['non-veg'],
  protein_tag: 'fish',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'fish',
});

const fishCurryCoastal = makeCurry('Fish Curry (Coastal)', {
  dietary_tags: ['non-veg'],
  protein_tag: 'fish',
  regional_tags: ['coastal-konkan'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'fish',
});

const prawnCurry = makeCurry('Prawn Curry', {
  dietary_tags: ['non-veg'],
  protein_tag: 'fish',
  regional_tags: ['coastal-konkan', 'south-indian'],
  occasion_tags: ['weekend'],
  curry_category: 'fish',
});

const eggCurry = makeCurry('Egg Curry', {
  dietary_tags: ['eggetarian'],
  protein_tag: 'egg',
  regional_tags: ['pan-indian'],
  occasion_tags: [],
  curry_category: 'egg',
});

const mixedVegCurry = makeCurry('Mixed Veg Curry', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: [],
  curry_category: 'vegetable',
});

const alooMatar = makeCurry('Aloo Matar', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: [],
  curry_category: 'vegetable',
});

const chanaMasala = makeCurry('Chana Masala', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'dal',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'legume',
});

const kormaVeg = makeCurry('Korma (Veg)', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: ['festive', 'weekend'],
  curry_category: 'vegetable',
});

const keralaStewVeg = makeCurry('Kerala Stew (Veg)', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'weekend'],
  curry_category: 'stew',
});

const keralaStewNonVeg = makeCurry('Kerala Stew (Non-Veg)', {
  dietary_tags: ['non-veg'],
  protein_tag: 'chicken',
  regional_tags: ['south-indian'],
  occasion_tags: ['weekend'],
  curry_category: 'stew',
});

const aviyal = makeCurry('Aviyal', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'festive'],
  curry_category: 'vegetable',
});

const kootu = makeCurry('Kootu', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'dal',
  regional_tags: ['south-indian'],
  occasion_tags: [],
  curry_category: 'lentil',
});

const kadhi = makeCurry('Kadhi', {
  dietary_tags: ['veg'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: [],
  curry_category: 'dairy',
});

// ─── Subzis (~20) ─────────────────────────────────────────────────────────────

const alooGobi = makeSubzi('Aloo Gobi', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const bhindiMasala = makeSubzi('Bhindi Masala', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const beansThoran = makeSubzi('Beans Thoran', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const cabbageThoran = makeSubzi('Cabbage Thoran', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const alooJeera = makeSubzi('Aloo Jeera', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const bainganBharta = makeSubzi('Baingan Bharta', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian'],
  occasion_tags: ['everyday', 'weekend'],
});

const palakDry = makeSubzi('Palak (dry)', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: [],
});

const mixedVegDry = makeSubzi('Mixed Veg (dry)', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: [],
});

const gobiManchurian = makeSubzi('Gobi Manchurian (dry)', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: ['weekend'],
});

const paneerBhurji = makeSubzi('Paneer Bhurji', {
  dietary_tags: ['veg'],
  protein_tag: 'paneer',
  regional_tags: ['north-indian', 'pan-indian'],
  occasion_tags: ['everyday', 'weekend'],
});

const alooFry = makeSubzi('Aloo Fry', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian', 'pan-indian'],
  occasion_tags: [],
});

const vendakkaiPoriyal = makeSubzi('Vendakkai Poriyal (Okra)', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const beetrootPoriyal = makeSubzi('Beetroot Poriyal', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const carrotBeansPoriyal = makeSubzi('Carrot Beans Poriyal', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const kootuCurry = makeSubzi('Kootu Curry', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'dal',
  regional_tags: ['south-indian'],
  occasion_tags: ['everyday', 'festive'],
});

const cauliflowerPepperFry = makeSubzi('Cauliflower Pepper Fry', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const potatoPodimas = makeSubzi('Potato Podimas', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const keeraiMasiyal = makeSubzi('Keerai Masiyal', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const mixedGreensThoran = makeSubzi('Thoran (mixed greens)', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['south-indian'],
  occasion_tags: [],
});

const capsicumStirFry = makeSubzi('Capsicum Stir Fry', {
  dietary_tags: ['veg', 'vegan'],
  protein_tag: 'none',
  regional_tags: ['pan-indian'],
  occasion_tags: [],
});

// ─── Extras (~17) ─────────────────────────────────────────────────────────────

const sambarExtra = makeExtra(
  'Sambar',
  'liquid',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'dal',
    regional_tags: ['south-indian'],
    occasion_tags: [],
  },
);

const rasamExtra = makeExtra(
  'Rasam',
  'liquid',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['south-indian'],
    occasion_tags: [],
  },
);

const papad = makeExtra(
  'Papad',
  'crunchy',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const fryums = makeExtra(
  'Fryums',
  'crunchy',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const mangoPickle = makeExtra(
  'Mango Pickle',
  'condiment',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const limePickle = makeExtra(
  'Lime Pickle',
  'condiment',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const mixedPickle = makeExtra(
  'Mixed Pickle',
  'condiment',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const coconutChutney = makeExtra(
  'Coconut Chutney',
  'condiment',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['south-indian'],
    occasion_tags: [],
  },
);

const tomatoChutney = makeExtra(
  'Tomato Chutney',
  'condiment',
  {
    dietary_tags: ['veg', 'vegan'],
    protein_tag: 'none',
    regional_tags: ['south-indian'],
    occasion_tags: [],
  },
);

const curdYogurt = makeExtra(
  'Curd / Yogurt',
  'dairy',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const buttermilk = makeExtra(
  'Buttermilk',
  'dairy',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['pan-indian', 'south-indian'],
    occasion_tags: [],
  },
);

const ghee = makeExtra(
  'Ghee',
  'dairy',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: [],
  },
);

const raita = makeExtra(
  'Raita',
  'dairy',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['north-indian', 'pan-indian'],
    occasion_tags: ['everyday', 'weekend'],
  },
);

const kheer = makeExtra(
  'Kheer',
  'sweet',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['north-indian', 'pan-indian'],
    occasion_tags: ['festive', 'weekend'],
  },
);

const payasam = makeExtra(
  'Payasam',
  'sweet',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['south-indian'],
    occasion_tags: ['festive'],
  },
);

const halwa = makeExtra(
  'Halwa',
  'sweet',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: ['festive', 'weekend'],
  },
);

const gulabJamun = makeExtra(
  'Gulab Jamun',
  'sweet',
  {
    dietary_tags: ['veg'],
    protein_tag: 'none',
    regional_tags: ['pan-indian'],
    occasion_tags: ['festive'],
  },
);

// ─── Exported seed arrays ─────────────────────────────────────────────────────

export const SEED_COMPONENTS: Omit<ComponentRecord, 'id'>[] = [
  // Bases (rice-based)
  plainRice,
  basmatiRice,
  brownRice,
  jeeraRice,
  lemonRice,
  tamarindRice,
  curdRice,
  tomatoRice,
  coconutRice,
  pulao,
  // Bases (bread-based)
  chapati,
  roti,
  paratha,
  naan,
  kulcha,
  puri,
  malabarParotta,
  // Bases (other) — Poori is excluded here, seeded separately
  idli,
  dosa,
  masalaDosa,
  appam,
  uttapam,
  upma,
  pongal,
  // Curries
  sambar,
  rasam,
  dalTadka,
  dalMakhani,
  rajma,
  chole,
  palakPaneer,
  paneerButterMasala,
  kadaiPaneer,
  butterChicken,
  chickenCurry,
  muttonCurry,
  fishCurrySouthIndian,
  fishCurryCoastal,
  prawnCurry,
  eggCurry,
  mixedVegCurry,
  alooMatar,
  chanaMasala,
  kormaVeg,
  keralaStewVeg,
  keralaStewNonVeg,
  aviyal,
  kootu,
  kadhi,
  // Subzis
  alooGobi,
  bhindiMasala,
  beansThoran,
  cabbageThoran,
  alooJeera,
  bainganBharta,
  palakDry,
  mixedVegDry,
  gobiManchurian,
  paneerBhurji,
  alooFry,
  vendakkaiPoriyal,
  beetrootPoriyal,
  carrotBeansPoriyal,
  kootuCurry,
  cauliflowerPepperFry,
  potatoPodimas,
  keeraiMasiyal,
  mixedGreensThoran,
  capsicumStirFry,
  // Extras
  sambarExtra,
  rasamExtra,
  papad,
  fryums,
  mangoPickle,
  limePickle,
  mixedPickle,
  coconutChutney,
  tomatoChutney,
  curdYogurt,
  buttermilk,
  ghee,
  raita,
  kheer,
  payasam,
  halwa,
  gulabJamun,
];

export function materializeSeedComponents(categoryLookup: SeedCategoryLookup): Omit<ComponentRecord, 'id'>[] {
  return SEED_COMPONENTS.map((component) => applySeedCategoryIds(component, categoryLookup));
}

export function materializePooriSeed(categoryLookup: SeedCategoryLookup): Omit<ComponentRecord, 'id'> {
  return applySeedCategoryIds(POORI_SEED, categoryLookup);
}

export const BUILT_IN_BASE_SEED_NAMES = [...BUILT_IN_BASE_CATEGORY_NAMES];
export const BUILT_IN_EXTRA_SEED_NAMES = [...BUILT_IN_EXTRA_CATEGORY_NAMES];
