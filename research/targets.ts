export type StarterTarget = {
  id: string
  name: string
  country: string
  region: string
  source_urls: string[]
}

export const starterTargets: StarterTarget[] = [
  {
    id: 'three-valleys',
    name: 'Les 3 Vallees',
    country: 'France',
    region: 'Savoie',
    source_urls: ['https://www.les3vallees.com/en/'],
  },
  {
    id: 'st-anton',
    name: 'St Anton am Arlberg',
    country: 'Austria',
    region: 'Tyrol',
    source_urls: ['https://www.skiarlberg.at/en/'],
  },
]
