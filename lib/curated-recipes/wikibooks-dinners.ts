import type { SupportedCookingUnit } from "@/lib/domain/units";

/**
 * A compact, reviewed starter collection.  The recipe notes are adaptations
 * for this application's ingredient contract; the linked Wikibooks page is
 * the attribution and canonical source, rather than an opaque web scrape.
 */
export const WIKIBOOKS_DINNER_COLLECTION = {
  slug: "wikibooks-dinner-starter",
  name: "Wikibooks dinner starter collection",
  description: "Twenty-five adaptable dinner ideas sourced from Wikibooks Cookbook.",
  sourceName: "Wikibooks Cookbook contributors",
  sourceUrl: "https://en.wikibooks.org/wiki/Cookbook:Recipes",
  licenseName: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

export type CuratedDinnerIngredient = {
  itemName: string;
  quantity: number | null;
  unit: SupportedCookingUnit | null;
  notes: string | null;
};

export type CuratedDinnerRecipe = {
  slug: string;
  title: string;
  description: string;
  sourceName: typeof WIKIBOOKS_DINNER_COLLECTION.sourceName;
  sourceTitle: string;
  sourceUrl: string;
  licenseUrl: typeof WIKIBOOKS_DINNER_COLLECTION.licenseUrl;
  servings: number;
  instructions: string;
  ingredients: readonly CuratedDinnerIngredient[];
  /** Controlled taxonomy slugs; `course-dinner` is present on every recipe. */
  tags: readonly string[];
};

type RecipeDraft = Omit<CuratedDinnerRecipe, "sourceName" | "licenseUrl">;

const LEGACY_TAG_ALIASES: Readonly<Record<string, string>> = {
  dinner: "course-dinner",
  quick: "method-quick",
  "protein-vegan": "dietary-vegan",
  "protein-vegetarian": "dietary-vegetarian",
};

const ingredient = (
  itemName: string,
  quantity: number | null,
  unit: SupportedCookingUnit | null,
  notes: string | null = null,
): CuratedDinnerIngredient => ({ itemName, quantity, unit, notes });

const wikibooks = (recipe: RecipeDraft): CuratedDinnerRecipe => ({
  ...recipe,
  tags: [...new Set(recipe.tags.map((tag) => LEGACY_TAG_ALIASES[tag] ?? tag))],
  sourceName: WIKIBOOKS_DINNER_COLLECTION.sourceName,
  licenseUrl: WIKIBOOKS_DINNER_COLLECTION.licenseUrl,
});

const source = (title: string) => `https://en.wikibooks.org/wiki/${encodeURIComponent(`Cookbook:${title}`).replace(/%3A/g, ":")}`;

/**
 * CC BY-SA 4.0 adaptations. Keep the attribution fields intact if these are
 * exported or redistributed, and refresh from the linked source before a
 * material editorial update.
 */
export const WIKIBOOKS_DINNER_RECIPES: readonly CuratedDinnerRecipe[] = [
  wikibooks({ slug: "hamburger", title: "Classic Hamburgers", sourceTitle: "Cookbook:Hamburger", sourceUrl: source("Hamburger"), description: "Pan-seared beef patties in buns with simple toppings.", servings: 4, instructions: "Season and shape the beef into four patties. Sear in a hot pan until cooked through. Serve in buns with lettuce, tomato, and condiments.", ingredients: [ingredient("beef mince", 500, "g"), ingredient("hamburger buns", 4, "each"), ingredient("lettuce", 4, "piece"), ingredient("tomato", 1, "each"), ingredient("ketchup", 4, "tbsp")], tags: ["course-dinner", "cuisine-american", "protein-beef", "method-stovetop", "method-quick"] }),
  wikibooks({ slug: "basic-risotto", title: "Basic Risotto", sourceTitle: "Cookbook:Risotto (Basic)", sourceUrl: source("Risotto (Basic)"), description: "Creamy Italian-style rice finished with cheese.", servings: 4, instructions: "Soften onion in oil. Toast rice, then add hot stock a ladle at a time, stirring until absorbed. Finish with butter and Parmesan.", ingredients: [ingredient("arborio rice", 300, "g"), ingredient("vegetable stock", 1, "l"), ingredient("onion", 1, "each"), ingredient("Parmesan", 60, "g"), ingredient("butter", 30, "g")], tags: ["dinner", "cuisine-italian", "protein-vegetarian", "dietary-vegetarian", "method-stovetop"] }),
  wikibooks({ slug: "egg-rolls", title: "Vegetable Egg Rolls", sourceTitle: "Cookbook:Egg Roll", sourceUrl: source("Egg Roll"), description: "Crisp rolls with cabbage and carrot filling.", servings: 4, instructions: "Stir-fry cabbage, carrot, and garlic until just tender. Cool, wrap in egg-roll wrappers, then bake or fry until crisp. Serve with dipping sauce.", ingredients: [ingredient("egg roll wrappers", 8, "each"), ingredient("cabbage", 300, "g"), ingredient("carrot", 2, "each"), ingredient("garlic", 2, "clove"), ingredient("soy sauce", 2, "tbsp")], tags: ["dinner", "cuisine-asian", "protein-vegetarian", "dietary-vegetarian", "method-oven"] }),
  wikibooks({ slug: "bean-burritos", title: "Black Bean Burritos", sourceTitle: "Cookbook:Burrito", sourceUrl: source("Burrito"), description: "Hearty tortilla wraps with beans, rice, and fresh toppings.", servings: 4, instructions: "Warm beans with spices. Fill tortillas with rice, beans, cheese, and salsa; roll tightly and toast seam-side down in a pan.", ingredients: [ingredient("tortillas", 4, "each"), ingredient("black beans", 2, "can"), ingredient("cooked rice", 2, "cup"), ingredient("cheddar", 120, "g"), ingredient("salsa", 1, "cup")], tags: ["dinner", "cuisine-mexican", "protein-vegetarian", "dietary-vegetarian", "method-stovetop", "quick"] }),
  wikibooks({ slug: "paella-valenciana", title: "Paella Valenciana", sourceTitle: "Cookbook:Paella Valenciana", sourceUrl: source("Paella Valenciana"), description: "Spanish rice with chicken, vegetables, and saffron-style seasoning.", servings: 4, instructions: "Brown chicken and vegetables in a wide pan. Stir in rice, tomato, stock, and saffron, then simmer uncovered until the rice is tender.", ingredients: [ingredient("chicken thighs", 600, "g"), ingredient("short grain rice", 300, "g"), ingredient("chicken stock", 750, "ml"), ingredient("tomato", 2, "each"), ingredient("green beans", 200, "g")], tags: ["dinner", "cuisine-spanish", "protein-chicken", "method-one-pot", "method-stovetop"] }),
  wikibooks({ slug: "beef-tacos", title: "Beef Tacos", sourceTitle: "Cookbook:Tacos", sourceUrl: source("Tacos"), description: "Seasoned beef in crisp or soft taco shells.", servings: 4, instructions: "Brown beef with onion and taco seasoning. Warm shells, then fill with beef, lettuce, tomato, cheese, and salsa.", ingredients: [ingredient("beef mince", 500, "g"), ingredient("taco shells", 8, "each"), ingredient("onion", 1, "each"), ingredient("lettuce", 1, "bunch"), ingredient("cheddar", 100, "g")], tags: ["dinner", "cuisine-mexican", "protein-beef", "method-stovetop", "quick"] }),
  wikibooks({ slug: "spaghetti-carbonara", title: "Spaghetti Carbonara", sourceTitle: "Cookbook:Spaghetti alla Carbonara", sourceUrl: source("Spaghetti alla Carbonara"), description: "Silky pasta with egg, cheese, and crisp pork.", servings: 4, instructions: "Cook spaghetti. Fry pancetta until crisp. Toss hot pasta off the heat with beaten eggs, Parmesan, pepper, and a splash of pasta water.", ingredients: [ingredient("spaghetti", 400, "g"), ingredient("pancetta", 150, "g"), ingredient("eggs", 3, "each"), ingredient("Parmesan", 80, "g"), ingredient("black pepper", 1, "tsp")], tags: ["dinner", "cuisine-italian", "protein-pork", "method-stovetop", "quick"] }),
  wikibooks({ slug: "vegetable-fried-rice", title: "Vegetable Fried Rice", sourceTitle: "Cookbook:Fried Rice", sourceUrl: source("Fried Rice"), description: "Fast skillet rice with egg and vegetables.", servings: 4, instructions: "Scramble egg in a wok. Add vegetables and cold rice, then stir-fry with soy sauce and sesame oil until hot and lightly crisp.", ingredients: [ingredient("cooked rice", 4, "cup"), ingredient("eggs", 3, "each"), ingredient("frozen mixed vegetables", 300, "g"), ingredient("soy sauce", 3, "tbsp"), ingredient("sesame oil", 1, "tbsp")], tags: ["dinner", "cuisine-asian", "protein-vegetarian", "dietary-vegetarian", "method-stovetop", "quick"] }),
  wikibooks({ slug: "jambalaya", title: "Chicken and Sausage Jambalaya", sourceTitle: "Cookbook:Jambalaya I", sourceUrl: source("Jambalaya I"), description: "Cajun-style rice with chicken, sausage, and vegetables.", servings: 4, instructions: "Brown chicken and sausage. Cook onion, celery, and capsicum, then add rice, tomatoes, stock, and seasoning. Simmer until tender.", ingredients: [ingredient("chicken thighs", 400, "g"), ingredient("smoked sausage", 250, "g"), ingredient("rice", 300, "g"), ingredient("diced tomatoes", 1, "can"), ingredient("chicken stock", 750, "ml")], tags: ["dinner", "cuisine-cajun", "protein-chicken", "protein-pork", "method-one-pot"] }),
  wikibooks({ slug: "arroz-con-pollo", title: "Arroz con Pollo", sourceTitle: "Cookbook:Arroz con Pollo (Rice and Chicken)", sourceUrl: source("Arroz con Pollo (Rice and Chicken)"), description: "One-pot chicken and rice with tomato and peas.", servings: 4, instructions: "Brown chicken with onion and garlic. Add rice, tomato, stock, and spices. Cover and simmer until the rice is tender; fold through peas.", ingredients: [ingredient("chicken thighs", 600, "g"), ingredient("rice", 300, "g"), ingredient("chicken stock", 750, "ml"), ingredient("diced tomatoes", 1, "can"), ingredient("frozen peas", 150, "g")], tags: ["dinner", "cuisine-caribbean", "protein-chicken", "method-one-pot"] }),
  wikibooks({ slug: "vegan-chili", title: "Vegan Bean Chili", sourceTitle: "Cookbook:Chili (Vegan)", sourceUrl: source("Chili (Vegan)"), description: "Tomato and bean chili suited to a weeknight dinner.", servings: 4, instructions: "Soften onion and capsicum. Add beans, tomatoes, corn, and chili seasoning. Simmer until thick, then serve with rice or tortillas.", ingredients: [ingredient("kidney beans", 2, "can"), ingredient("diced tomatoes", 2, "can"), ingredient("corn", 1, "can"), ingredient("capsicum", 1, "each"), ingredient("chili powder", 2, "tsp")], tags: ["dinner", "cuisine-mexican", "protein-legumes", "protein-vegan", "dietary-vegan", "method-one-pot"] }),
  wikibooks({ slug: "shepherds-pie", title: "Shepherd's Pie", sourceTitle: "Cookbook:Shepherd's Pie I", sourceUrl: source("Shepherd's Pie I"), description: "Baked lamb and vegetable pie under mashed potato.", servings: 4, instructions: "Cook lamb with onion, carrot, peas, and gravy. Top with mashed potato and bake until browned and bubbling.", ingredients: [ingredient("lamb mince", 500, "g"), ingredient("potatoes", 800, "g"), ingredient("carrot", 2, "each"), ingredient("frozen peas", 150, "g"), ingredient("onion", 1, "each")], tags: ["dinner", "cuisine-british", "protein-lamb", "method-oven"] }),
  wikibooks({ slug: "butter-chicken", title: "Indian Butter Chicken", sourceTitle: "Cookbook:Indian Butter Chicken I", sourceUrl: source("Indian Butter Chicken I"), description: "Mild tomato and butter chicken curry.", servings: 4, instructions: "Brown chicken with spices. Simmer with tomato puree, butter, and cream until tender. Serve with rice or naan.", ingredients: [ingredient("chicken breast", 600, "g"), ingredient("tomato puree", 1, "cup"), ingredient("cream", 250, "ml"), ingredient("butter", 40, "g"), ingredient("garam masala", 2, "tsp")], tags: ["dinner", "cuisine-indian", "protein-chicken", "method-stovetop"] }),
  wikibooks({ slug: "chicken-tikka-masala", title: "Chicken Tikka Masala", sourceTitle: "Cookbook:Chicken Tikka Masala", sourceUrl: source("Chicken Tikka Masala"), description: "Spiced chicken in a tomato-yoghurt curry sauce.", servings: 4, instructions: "Coat chicken in yoghurt and spices, then brown. Simmer with onion, tomato, and cream until cooked through. Serve with rice.", ingredients: [ingredient("chicken thighs", 600, "g"), ingredient("plain yoghurt", 250, "ml"), ingredient("diced tomatoes", 1, "can"), ingredient("cream", 150, "ml"), ingredient("garam masala", 2, "tsp")], tags: ["dinner", "cuisine-indian", "protein-chicken", "method-stovetop"] }),
  wikibooks({ slug: "chicken-andouille-gumbo", title: "Chicken and Andouille Gumbo", sourceTitle: "Cookbook:Chicken and Andouille Sausage Gumbo", sourceUrl: source("Chicken and Andouille Sausage Gumbo"), description: "Slow-simmered Louisiana stew with chicken and sausage.", servings: 4, instructions: "Make a dark roux. Cook vegetables, then add chicken, sausage, stock, and seasoning. Simmer gently and serve over rice.", ingredients: [ingredient("chicken thighs", 500, "g"), ingredient("smoked sausage", 250, "g"), ingredient("chicken stock", 1, "l"), ingredient("celery", 3, "piece"), ingredient("capsicum", 1, "each")], tags: ["dinner", "cuisine-cajun", "protein-chicken", "protein-pork", "method-one-pot"] }),
  wikibooks({ slug: "gambas-al-ajillo", title: "Garlic Shrimp", sourceTitle: "Cookbook:Gambas al Ajillo (Garlic Shrimp)", sourceUrl: source("Gambas al Ajillo (Garlic Shrimp)"), description: "Spanish garlic shrimp with chilli and parsley.", servings: 4, instructions: "Warm olive oil with garlic and chilli. Add shrimp and cook just until pink. Finish with parsley and serve with bread or rice.", ingredients: [ingredient("raw shrimp", 500, "g"), ingredient("garlic", 5, "clove"), ingredient("olive oil", 4, "tbsp"), ingredient("chili flakes", 1, "tsp"), ingredient("parsley", 1, "bunch")], tags: ["dinner", "cuisine-spanish", "protein-seafood", "method-stovetop", "quick"] }),
  wikibooks({ slug: "rice-and-black-beans", title: "Rice and Black Beans", sourceTitle: "Cookbook:Rice with Black Beans (Arroz con Frijoles Negros)", sourceUrl: source("Rice with Black Beans (Arroz con Frijoles Negros)"), description: "Cuban-style beans and rice with citrus and herbs.", servings: 4, instructions: "Cook onion, garlic, and spices. Add black beans and a little stock, simmer, then serve over rice with lime and coriander.", ingredients: [ingredient("black beans", 2, "can"), ingredient("rice", 300, "g"), ingredient("onion", 1, "each"), ingredient("garlic", 3, "clove"), ingredient("lime", 1, "each")], tags: ["dinner", "cuisine-caribbean", "protein-legumes", "protein-vegan", "dietary-vegan", "method-one-pot"] }),
  wikibooks({ slug: "coq-au-vin", title: "Coq au Vin", sourceTitle: "Cookbook:Coq au Vin I", sourceUrl: source("Coq au Vin I"), description: "French chicken braised with mushrooms and wine.", servings: 4, instructions: "Brown chicken and bacon. Add onion, mushrooms, wine, and stock, then cover and braise until the chicken is tender.", ingredients: [ingredient("chicken thighs", 800, "g"), ingredient("bacon", 150, "g"), ingredient("mushrooms", 250, "g"), ingredient("red wine", 500, "ml"), ingredient("chicken stock", 250, "ml")], tags: ["dinner", "cuisine-french", "protein-chicken", "protein-pork", "method-one-pot"] }),
  wikibooks({ slug: "empanadas", title: "Beef Empanadas", sourceTitle: "Cookbook:Empanada", sourceUrl: source("Empanada"), description: "Baked pastry parcels with savory beef filling.", servings: 4, instructions: "Cook beef with onion, spices, and tomato paste. Spoon into pastry circles, fold and seal, then bake until golden.", ingredients: [ingredient("beef mince", 500, "g"), ingredient("shortcrust pastry", 2, "packet"), ingredient("onion", 1, "each"), ingredient("tomato paste", 2, "tbsp"), ingredient("egg", 1, "each")], tags: ["dinner", "cuisine-south-american", "protein-beef", "method-oven"] }),
  wikibooks({ slug: "spinach-ravioli", title: "Spinach Ravioli", sourceTitle: "Cookbook:Ravioli", sourceUrl: source("Ravioli"), description: "Filled pasta with ricotta, spinach, and tomato sauce.", servings: 4, instructions: "Mix ricotta and chopped spinach. Fill pasta sheets, seal, and boil until tender. Serve with warm tomato sauce.", ingredients: [ingredient("pasta sheets", 400, "g"), ingredient("ricotta", 250, "g"), ingredient("spinach", 200, "g"), ingredient("tomato sauce", 2, "cup"), ingredient("Parmesan", 40, "g")], tags: ["dinner", "cuisine-italian", "protein-vegetarian", "dietary-vegetarian", "method-stovetop"] }),
  wikibooks({ slug: "spaghetti-puttanesca", title: "Spaghetti Puttanesca", sourceTitle: "Cookbook:Spaghetti alla Puttanesca", sourceUrl: source("Spaghetti alla Puttanesca"), description: "Bold tomato pasta with olives, capers, and anchovy.", servings: 4, instructions: "Cook spaghetti. Simmer garlic, anchovy, tomatoes, olives, capers, and chilli. Toss with pasta and parsley.", ingredients: [ingredient("spaghetti", 400, "g"), ingredient("diced tomatoes", 1, "can"), ingredient("olives", 150, "g"), ingredient("capers", 2, "tbsp"), ingredient("anchovies", 6, "piece")], tags: ["dinner", "cuisine-italian", "protein-seafood", "method-stovetop", "quick"] }),
  wikibooks({ slug: "spaghetti-with-clams", title: "Spaghetti with Clams", sourceTitle: "Cookbook:Spaghetti with Clams", sourceUrl: source("Spaghetti with Clams"), description: "Garlicky Italian pasta with clams and herbs.", servings: 4, instructions: "Cook spaghetti. Steam clams with garlic, wine, and tomato until opened. Toss with pasta and parsley, discarding unopened clams.", ingredients: [ingredient("spaghetti", 400, "g"), ingredient("clams", 1, "kg"), ingredient("garlic", 4, "clove"), ingredient("white wine", 250, "ml"), ingredient("parsley", 1, "bunch")], tags: ["dinner", "cuisine-italian", "protein-seafood", "method-stovetop"] }),
  wikibooks({ slug: "ossobuco", title: "Ossobuco alla Milanese", sourceTitle: "Cookbook:Ossobuco Alla Milanese", sourceUrl: source("Ossobuco Alla Milanese"), description: "Italian braised veal shanks with tomato and citrus herb garnish.", servings: 4, instructions: "Brown veal shanks. Add vegetables, tomato, wine, and stock; cover and braise until tender. Finish with lemon-parsley gremolata.", ingredients: [ingredient("veal shanks", 4, "piece"), ingredient("diced tomatoes", 1, "can"), ingredient("white wine", 250, "ml"), ingredient("beef stock", 500, "ml"), ingredient("lemon", 1, "each")], tags: ["dinner", "cuisine-italian", "protein-beef", "method-one-pot"] }),
  wikibooks({ slug: "mejadra", title: "Rice and Lentils (Mejadra)", sourceTitle: "Cookbook:Rice and Lentils (Mejadra)", sourceUrl: source("Rice and Lentils (Mejadra)"), description: "Fragrant lentils and rice topped with caramelised onions.", servings: 4, instructions: "Cook lentils until nearly tender. Fry onions slowly until dark and sweet. Simmer rice with lentils and spices, then top with onions.", ingredients: [ingredient("brown lentils", 250, "g"), ingredient("rice", 250, "g"), ingredient("onions", 3, "each"), ingredient("cumin", 1, "tsp"), ingredient("vegetable stock", 750, "ml")], tags: ["dinner", "cuisine-middle-eastern", "protein-legumes", "protein-vegan", "dietary-vegan", "method-one-pot"] }),
  wikibooks({ slug: "falafel-wraps", title: "Falafel Wraps", sourceTitle: "Cookbook:Falafel", sourceUrl: source("Falafel"), description: "Chickpea patties in warm flatbread with salad and tahini.", servings: 4, instructions: "Blend chickpeas, onion, garlic, herbs, and spices. Shape into patties and bake or fry until crisp. Serve in pita with salad and tahini.", ingredients: [ingredient("chickpeas", 2, "can"), ingredient("pita bread", 4, "each"), ingredient("garlic", 2, "clove"), ingredient("parsley", 1, "bunch"), ingredient("tahini", 4, "tbsp")], tags: ["dinner", "cuisine-mediterranean", "protein-legumes", "protein-vegan", "dietary-vegan", "method-oven"] }),
];

if (WIKIBOOKS_DINNER_RECIPES.length !== 25) {
  throw new Error("The Wikibooks dinner starter collection must contain exactly 25 recipes.");
}
