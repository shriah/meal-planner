import type { ComponentRecord, DietaryTag, RegionalTag } from '@/types/component'

export function filterComponents(
  components: ComponentRecord[],
  searchText: string,
  activeDietaryTags: DietaryTag[],
  activeRegionalTags: RegionalTag[],
): ComponentRecord[] {
  return components.filter(c => {
    const nameMatch = searchText === '' || c.name.toLowerCase().includes(searchText.toLowerCase())
    const dietaryMatch = activeDietaryTags.every(tag => c.dietary_tags.includes(tag))
    const regionalMatch = activeRegionalTags.every(tag => c.regional_tags.includes(tag))
    return nameMatch && dietaryMatch && regionalMatch
  })
}
