export const C = {
  cream: "#F7F4EF",
  warmWhite: "#FDFCFA",
  birch: "#C8B89A",
  clay: "#B09B89",
  sage: "#8DA399",
  forest: "#3D4F3E",
  charcoal: "#2C2C2A",
  mist: "#E8E3DC",
  muted: "#7A756E"
};

export const LISTINGS = [
  {
    id: "1",
    neigh: "Etu-Töölö · Central Helsinki",
    name: "Beautiful Private Space",
    desc: "A newly renovated private unit in a historic building with high ceilings and a stunning spa-inspired marble bathroom featuring a rainfall shower. Hotel-quality comfort in a boutique, intimate setting. Minutes from the Sibelius Monument and the waterfront. Note: Shared entrance with the main apartment.",
    tags: ["TV", "Wifi", "Coffee machine", "Microwave", "Refrigerator", "Hair dryer", "Iron", "Kettle"],
    price: 80,
    cleaningFee: 5,
    size: "20 m²",
    guests: 2,
    min: 1,
    rating: "★ 4.87 · Superhost",
    bg: "linear-gradient(155deg,#C4B49A,#A89278)",
    imgs: [
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80"
    ]
  },
  {
    id: "2",
    neigh: "Kallio · Creative District",
    name: "Cozy Studio",
    desc: "A bright, design-led studio in Kallio — Helsinki's most creative and social neighbourhood. Located just 300m from the Metro and 100m from the Tram. Stylishly furnished and perfectly situated for exploring the city's vibrant bars and cafes.",
    tags: ["TV", "Wifi", "Kitchenette", "Microwave", "Oven", "Refrigerator", "Hair dryer", "Iron"],
    price: 75,
    cleaningFee: 5,
    size: "27.5 m²",
    guests: 2,
    min: 2,
    rating: "★ 4.77 · Superhost",
    bg: "linear-gradient(155deg,#B0C4B8,#7A9E8A)",
    imgs: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
      "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=800&q=80",
      "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=800&q=80"
    ]
  },
  {
    id: "3",
    neigh: "Roihuvuori · Residential East",
    name: "Charming Studio for Couples",
    desc: "A bright and airy studio with big windows and direct backyard access. Located in a calm residential neighbourhood, just 4 metro stops from the city centre. Perfect for couples seeking a genuine local feel with free parking on the premises.",
    tags: ["TV", "Wifi", "Full Kitchen", "Stove", "Oven", "Toaster", "Backyard", "Free Parking"],
    price: 50,
    cleaningFee: 15,
    size: "24 m²",
    guests: 2,
    min: 2,
    rating: "★ 4.82 · Superhost",
    bg: "linear-gradient(155deg,#C9BDA8,#A8977E)",
    imgs: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
      "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800&q=80",
      "https://images.unsplash.com/photo-1565183997392-2f6f122e5912?w=800&q=80"
    ]
  }
];

export const BOOKED: Record<string, string[]> = {
  "1": [],
  "2": [],
  "3": []
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const GUIDE_DATA = [
  {
    icon: "☕",
    title: "Cafés & Coffee",
    color: C.clay,
    places: [
      { name: "Kaffa Roastery", addr: "Pursimiehenkatu 29, Punavuori", rating: "4.7", note: "Helsinki's most celebrated specialty roaster." },
      { name: "Good Life Coffee", addr: "Kolmas linja 17, Kallio", rating: "4.6", note: "Kallio's local favourite. Relaxed vibe, superb flat whites." },
      { name: "Johan & Nyström", addr: "Kanavaranta 7, Katajanokka", rating: "4.5", note: "Scandinavian coffee culture at its finest, near the harbour." },
      { name: "Fazer Café", addr: "Kluuvikatu 3, Keskusta", rating: "4.4", note: "Helsinki institution since 1891. Best cinnamon rolls in the city." },
      { name: "Café Regatta", addr: "Merikannontie 8, Töölö", rating: "4.5", note: "Iconic red cottage on the waterfront. Open fire in winter." },
      { name: "Andante Coffee", addr: "Uudenmaankatu 9, Punavuori", rating: "4.6", note: "Tiny, precise, exceptional. A pilgrimage for coffee lovers." },
      { name: "Kaffecentralen", addr: "Aleksanterinkatu 21, Keskusta", rating: "4.3", note: "Classic Helsinki café in a beautiful historic building." },
      { name: "La Torrefazione", addr: "Aleksanterinkatu 50, Kallio", rating: "4.5", note: "Italian-inspired neighbourhood gem in Kallio." },
      { name: "Tin Tin Tango", addr: "Töölöntorinkatu 7, Töölö", rating: "4.4", note: "The neighbourhood café that locals defend fiercely." },
      { name: "Café Ekberg", addr: "Bulevardi 9, Punavuori", rating: "4.4", note: "Founded in 1852. Grand interior, superb pastries." }
    ]
  },
  {
    icon: "◈",
    title: "Restaurants",
    color: C.forest,
    places: [
      { name: "Olo", addr: "Pohjoisesplanadi 5, Keskusta", rating: "4.7", note: "Michelin-starred Nordic tasting menus. Exceptional produce." },
      { name: "Demo", addr: "Uudenmaankatu 9–11, Punavuori", rating: "4.6", note: "Relaxed Michelin-starred dining. Finnish classics reimagined." },
      { name: "Savoy", addr: "Eteläesplanadi 14, Keskusta", rating: "4.5", note: "Iconic 1937 Alvar Aalto design. Finnish fine dining institution." },
      { name: "Löyly", addr: "Hernesaarenranta 4, Hernesaari", rating: "4.4", note: "Waterfront sauna restaurant. Nordic small plates and cocktails." },
      { name: "Nokka", addr: "Kanavaranta 7, Katajanokka", rating: "4.5", note: "Farm-to-table Finnish cooking in a stunning harbour warehouse." },
      { name: "Muru", addr: "Fredrikinkatu 41, Punavuori", rating: "4.5", note: "Neighbourhood bistro loved by Helsinki food insiders." },
      { name: "Palace", addr: "Eteläranta 10, Keskusta", rating: "4.6", note: "Rooftop fine dining with panoramic harbour views." },
      { name: "Grön", addr: "Albertinkatu 36, Punavuori", rating: "4.6", note: "Plant-forward Michelin-starred tasting menus." },
      { name: "Ravintola Savel", addr: "Hietalahdenranta 5, Punavuori", rating: "4.4", note: "Seasonal Finnish-French. Beautiful waterside location." },
      { name: "Finnjävel", addr: "Pohjoisesplanadi 17, Keskusta", rating: "4.5", note: "Reinventing traditional Finnish cuisine." }
    ]
  },
  {
    icon: "◎",
    title: "Day Trips",
    color: C.muted,
    places: [
      { name: "Suomenlinna Sea Fortress", addr: "Ferry from Market Square, 15 min", rating: "4.7", note: "UNESCO World Heritage island fortress. A must-do." },
      { name: "Porvoo Old Town", addr: "50 km east of Helsinki, 1h by bus", rating: "4.7", note: "Finland's most charming historic town." },
      { name: "Nuuksio National Park", addr: "35 km northwest, 45 min by bus", rating: "4.6", note: "Finnish wilderness. Lakes, forests, hiking trails." },
      { name: "Tallinn, Estonia", addr: "2.5h by ferry from West Harbour", rating: "4.7", note: "Medieval Old Town, great food scene." },
      { name: "Hvitträsk", addr: "30 km west, 45 min", rating: "4.5", note: "Historic studio home of Finnish architects." },
      { name: "Fiskars Village", addr: "100 km west, 1.5h by car", rating: "4.6", note: "Historic ironworks village turned design mecca." },
      { name: "Sipoonkorpi National Park", addr: "25 km east, 40 min", rating: "4.4", note: "Ancient forest, peaceful trails." },
      { name: "Ainola — Sibelius Home", addr: "40 km north, 50 min", rating: "4.5", note: "Jean Sibelius's lakeside home and final resting place." },
      { name: "Turku", addr: "165 km west, 2h by train", rating: "4.5", note: "Finland's oldest city. Medieval castle, vibrant food scene." },
      { name: "Seurasaari Open-Air Museum", addr: "Helsinki island, 30 min by bus", rating: "4.4", note: "Historic Finnish buildings from across the country." }
    ]
  },
  {
    icon: "♪",
    title: "Nightlife & Culture",
    color: "#534AB7",
    places: [
      { name: "Kaiku", addr: "Köydenpunojankatu 8, Kallio", rating: "4.5", note: "Helsinki's premier underground techno club." },
      { name: "Ääniwalli", addr: "Sturenkatu 9, Kallio", rating: "4.4", note: "Multi-room club with the best sound system in the Nordics." },
      { name: "BOTTA", addr: "Museokatu 10, Töölö", rating: "4.5", note: "Cocktail bar and live music. Beautiful interiors." },
      { name: "On The Rocks", addr: "Mikonkatu 15, Keskusta", rating: "4.3", note: "Helsinki's classic rock bar. Always packed, always fun." },
      { name: "Helsinki Music Centre", addr: "Mannerheimintie 13a, Keskusta", rating: "4.7", note: "World-class concert hall." },
      { name: "Finnish National Opera", addr: "Helsinginkatu 58, Töölö", rating: "4.6", note: "Beautiful modern opera house." },
      { name: "Tennispalatsi Cinema", addr: "Salomonkatu 15, Kamppi", rating: "4.3", note: "14-screen cinema. Art-house and blockbusters." },
      { name: "Kulttuurisauna", addr: "Hakaniemenranta 17, Hakaniemi", rating: "4.6", note: "Architecturally stunning public sauna on the waterfront." },
      { name: "Allas Sea Pool", addr: "Katajanokanlaituri 2a, Katajanokka", rating: "4.3", note: "Outdoor sea pools, sauna, and rooftop bar." },
      { name: "Korjaamo", addr: "Töölönkatu 51b, Töölö", rating: "4.4", note: "Cultural centre in a historic tram depot." }
    ]
  },
  {
    icon: "◇",
    title: "Markets & Shopping",
    color: C.clay,
    places: [
      { name: "Old Market Hall", addr: "Eteläranta 1, Keskusta", rating: "4.5", note: "Helsinki's beloved 1889 market hall." },
      { name: "Hakaniemi Market Hall", addr: "Hakaniementori 1, Hakaniemi", rating: "4.4", note: "Two floors of food stalls, textiles, and local produce." },
      { name: "Design District Helsinki", addr: "Punavuori & Ullanlinna", rating: "4.6", note: "25 streets of Finnish design studios and galleries." },
      { name: "Marimekko Flagship", addr: "Pohjoisesplanadi 33, Keskusta", rating: "4.5", note: "The iconic Finnish design house in its most beautiful store." },
      { name: "Iittala & Arabia Design Centre", addr: "Hämeentie 135, Arabia", rating: "4.4", note: "Finnish design heritage. Outlet prices on seconds." },
      { name: "Flea Market Hietalahti", addr: "Hietalahdenranta, Punavuori", rating: "4.3", note: "Helsinki's favourite outdoor flea market." },
      { name: "Forum Shopping Centre", addr: "Mannerheimintie 20, Keskusta", rating: "4.2", note: "Central multi-floor mall." },
      { name: "Kamppi Shopping Centre", addr: "Urho Kekkosen katu 1, Kamppi", rating: "4.1", note: "Modern mall with bus and metro connections below." },
      { name: "Stockmann", addr: "Aleksanterinkatu 52, Keskusta", rating: "4.3", note: "Finland's most iconic department store. Eight floors." },
      { name: "Kauppatori Market Square", addr: "Eteläranta, Keskusta", rating: "4.4", note: "Open-air market by the harbour. Fresh berries and crafts." }
    ]
  },
  {
    icon: "◉",
    title: "Must-See Sights",
    color: "#185FA5",
    places: [
      { name: "Helsinki Cathedral", addr: "Unioninkatu 29, Senaatintori", rating: "4.6", note: "Neoclassical landmark dominating Senate Square." },
      { name: "Temppeliaukio Church", addr: "Lutherinkatu 3, Töölö", rating: "4.7", note: "Rock Church carved directly into solid granite." },
      { name: "Ateneum Art Museum", addr: "Kaivokatu 2, Rautatientori", rating: "4.6", note: "Finland's national gallery." },
      { name: "Kiasma", addr: "Mannerheiminaukio 2, Keskusta", rating: "4.4", note: "Striking Steven Holl building. Contemporary art." },
      { name: "Uspenski Cathedral", addr: "Kanavakatu 1, Katajanokka", rating: "4.5", note: "Russia's largest Orthodox cathedral outside Russia." },
      { name: "Market Square & South Harbour", addr: "Eteläranta, Keskusta", rating: "4.5", note: "The heart of Helsinki. Ferries, market stalls, sea views." },
      { name: "Sibelius Monument", addr: "Mechelininkatu, Töölö", rating: "4.5", note: "Abstract steel organ pipes. Surprising and moving." },
      { name: "National Museum of Finland", addr: "Mannerheimintie 34, Keskusta", rating: "4.5", note: "Finnish history from prehistoric times to the present." },
      { name: "Senate Square", addr: "Aleksanterinkatu, Keskusta", rating: "4.6", note: "Helsinki's grandest square." },
      { name: "Kamppi Chapel of Silence", addr: "Simonsgatan 7, Kamppi", rating: "4.6", note: "Small wooden chapel in the city centre. Free, open daily." }
    ]
  }
];

export const REVIEWS = [
  { name: "Sophie M.", country: "France", flag: "🇫🇷", listing: "Beautiful Private Space", rating: 5, date: "March 2026", text: "Anna's apartment was absolutely perfect. The attention to detail is extraordinary — everything felt curated and personal. Helsinki is a wonderful city and having this beautiful space to come home to made all the difference." },
  { name: "James & Rachel", country: "UK", flag: "🇬🇧", listing: "Cozy Studio, Central Helsinki", rating: 5, date: "February 2026", text: "We stayed for a week in Kallio and felt completely at home. Anna responded to every question within minutes. The neighbourhood recommendations she sent were spot on — we found our favourite coffee shop on day one." },
  { name: "Mikael L.", country: "Sweden", flag: "🇸🇪", listing: "Charming Studio for Couples", rating: 5, date: "January 2026", text: "Came to Helsinki for a long weekend with my partner. The studio is small but so cleverly designed — nothing is missing. The Japanese garden nearby was a hidden gem we'd never have found without Anna's guide." },
  { name: "Yuki T.", country: "Japan", flag: "🇯🇵", listing: "Beautiful Private Space", rating: 5, date: "March 2026", text: "I travel for work frequently and this was one of the best stays I've had anywhere in Europe. Clean, quiet, beautifully designed. Self check-in worked perfectly. I'll be back in June." },
  { name: "Anna K.", country: "Germany", flag: "🇩🇪", listing: "Cozy Studio, Central Helsinki", rating: 5, date: "February 2026", text: "Incredible value for a city like Helsinki. The apartment photos do not do it justice — it's even better in person. Great location for exploring the whole city on foot. Highly, highly recommend." },
  { name: "Marco & Giulia", country: "Italy", flag: "🇮🇹", listing: "Charming Studio for Couples", rating: 5, date: "January 2026", text: "We came for a winter escape and fell in love with Helsinki. The apartment was warm, cosy, and perfectly equipped. Anna's tips about the public saunas were the highlight of our trip." }
];

export const FAQS = [
  { q: "How does check-in work?", a: "All three apartments use a self check-in system with a secure code box at the door. You'll receive your personal entry code 24 hours before arrival. No need to meet anyone — arrive any time after 15:00." },
  { q: "What time is check-out?", a: "Check-out is at 11:00. If you need a late check-out, just ask — we'll do our best to accommodate depending on availability." },
  { q: "Is parking available?", a: "Free parking is available on the premises at our Roihuvuori studio. For our Etu-Töölö and Kallio apartments, street parking is available nearby. We'll share specific parking instructions with your booking confirmation." },
  { q: "Are pets allowed?", a: "Unfortunately we don't accept pets in any of the apartments due to allergies among our regular guests. We hope you understand." },
  { q: "Is there a sauna?", a: "The Charming Studio in Roihuvuori has shared sauna access in the building, bookable for private use. Helsinki also has wonderful public saunas nearby — Kulttuurisauna and Allas Sea Pool are our top picks." },
  { q: "What is the cancellation policy?", a: "Free cancellation up to 7 days before check-in for a full refund. Cancellations within 7 days are non-refundable. For last-minute situations, always reach out — we try to be flexible." },
  { q: "Can I get an invoice for business travel?", a: "Absolutely. Just let us know at the time of booking and we'll issue a formal invoice with all the details your accountant needs." },
  { q: "Is the WiFi fast enough for remote work?", a: "Yes — all apartments have fibre internet (100+ Mbps). There's a proper desk in each apartment too." }
];
