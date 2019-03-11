import {Injectable} from '@angular/core';
import machinesRaw from '../../assets/machines.json';
import recipesRaw from '../../assets/recipes.json';

export interface Machine {
  name: string;
  type: string;
  inputs: number[];
  outputs: number;
  speed: number;
  power: number;
}

export interface Recipe {
  type: 'crafting' | 'smelting' | 'mining' | 'harvesting';
  steps: number;
  duration: number;
  in: { [key: string]: number; };
  out: { [key: string]: number; };
}

export interface RecipeTree {
  recipe?: Recipe;
  times: number;
  machine: Machine;
  inputs: RecipeTree[];
}

const PlayerMachine: Machine = {
  name: 'Player',
  type: 'Player',
  inputs: [],
  outputs: 0,
  speed: 1,
  power: 0,
};

@Injectable()
export class CalculatorService {

  constructor() {
    this.recipes.forEach(recipe => {
      for (const out in recipe.out) {
        this.items.add(out);
        if (!this.mapping.has(out)) {
          this.mapping.set(out, []);
        }
        this.mapping.get(out).push(recipe);
      }
    });
  }

  machines: Machine[] = machinesRaw;
  recipes: Recipe[] = recipesRaw;
  items: Set<string> = new Set<string>();
  mapping: Map<string, Recipe[]> = new Map();

  getBaseResources() {
    const hasRecipes = new Set<string>();
    const doesntHaveRecipes = new Set<string>();

    this.recipes.forEach(recipe => {
      if (recipe.type !== 'mining') {
        for (const key in recipe.out) {
          hasRecipes.add(key);
          doesntHaveRecipes.delete(key);
        }

        for (const key in recipe.in) {
          if (!hasRecipes.has(key)) {
            doesntHaveRecipes.add(key);
          }
        }
      } else {

        for (const key in recipe.in) {
          doesntHaveRecipes.add(key);
        }
      }
    });

    return [...doesntHaveRecipes];
  }

  getMachine(type: string, inputs: number) {
    // TODO Conditionals?
    return this.machines.filter(machine => {
      if (machine.type === type) {
        if (machine.inputs.indexOf(inputs) >= 0) {
          return true;
        }
      }
    }).sort((machineA, machineB) => {
      return machineB.speed - machineA.speed;
    })[0];
  }

  getRecipe(item: string, count: number): RecipeTree {
    const recipeOptions = this.mapping.get(item);

    if (!recipeOptions || recipeOptions.length === 0) {
      return {
        inputs: [],
        times: count,
        machine: PlayerMachine,
        recipe: {
          type: 'harvesting',
          steps: 0,
          duration: 0,
          in: {},
          out: {
            [item]: 1
          }
        }
      };
    }

    // TODO Conditionals?
    const recipe = recipeOptions[0];

    const result: RecipeTree = {
      inputs: [],
      times: count,
      machine: this.getMachine(recipe.type, Object.keys(recipe.in).length),
      recipe: recipe
    };

    for (const input in recipe.in) {
      const subRecipe = this.getRecipe(input, result.times * recipe.in[input]);
      if (subRecipe) {
        result.inputs.push(subRecipe);
      }
    }

    return result;
  }

}
