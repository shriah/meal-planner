export interface TagValue {
  id: number;
  name: string;
}

/** A named set of tag values. `multiple` = a dish may carry several values of the group. */
export interface TagGroupRecord {
  id: number;
  name: string;
  position: number;
  multiple: boolean;
  values: TagValue[];
  /** Set on the four converted groups; how code finds them once they can be renamed. */
  legacy?: ConvertedTagGroupKey;
  created_at: string;
}

/** The four groups converted from today's fixed tag arrays (`frequency` stays a fixed field). */
export type ConvertedTagGroupKey = 'dietary' | 'protein' | 'regional' | 'occasion';
