const request = require("request");
const async = require("async");
const fs = require("fs");
const simplevdf = require("simple-vdf");
const { cleanupArray } = require("../utils");
const hero_list = require("../build/heroes.json");

// Get your token from https://stratz.com/api
const STRATZ_TOKEN = process.env.STRATZ_TOKEN || '';

const extraStrings = {
  DOTA_ABILITY_BEHAVIOR_NONE: "None",
  DOTA_ABILITY_BEHAVIOR_PASSIVE: "Passive",
  DOTA_ABILITY_BEHAVIOR_UNIT_TARGET: "Unit Target",
  DOTA_ABILITY_BEHAVIOR_CHANNELLED: "Channeled",
  DOTA_ABILITY_BEHAVIOR_POINT: "Point Target",
  DOTA_ABILITY_BEHAVIOR_ROOT_DISABLES: "Root",
  DOTA_ABILITY_BEHAVIOR_AOE: "AOE",
  DOTA_ABILITY_BEHAVIOR_NO_TARGET: "No Target",
  DOTA_ABILITY_BEHAVIOR_AUTOCAST: "Autocast",
  DOTA_ABILITY_BEHAVIOR_ATTACK: "Attack Modifier",
  DOTA_ABILITY_BEHAVIOR_IMMEDIATE: "Instant Cast",
  DOTA_ABILITY_BEHAVIOR_HIDDEN: "Hidden",
  DAMAGE_TYPE_PHYSICAL: "Physical",
  DAMAGE_TYPE_MAGICAL: "Magical",
  DAMAGE_TYPE_PURE: "Pure",
  SPELL_IMMUNITY_ENEMIES_YES: "Yes",
  SPELL_IMMUNITY_ENEMIES_NO: "No",
  SPELL_IMMUNITY_ALLIES_YES: "Yes",
  SPELL_IMMUNITY_ALLIES_NO: "No",
  SPELL_DISPELLABLE_YES: "Yes",
  SPELL_DISPELLABLE_NO: "No",
  DOTA_UNIT_TARGET_TEAM_BOTH: "Both",
  DOTA_UNIT_TARGET_TEAM_ENEMY: "Enemy",
  DOTA_UNIT_TARGET_TEAM_FRIENDLY: "Friendly",
  DOTA_UNIT_TARGET_HERO: "Hero",
  DOTA_UNIT_TARGET_BASIC: "Basic",
  DOTA_UNIT_TARGET_BUILDING: "Building",
  DOTA_UNIT_TARGET_TREE: "Tree"
};

const ignoreStrings = new Set([
  "DOTA_ABILITY_BEHAVIOR_ROOT_DISABLES",
  "DOTA_ABILITY_BEHAVIOR_DONT_RESUME_ATTACK",
  "DOTA_ABILITY_BEHAVIOR_DONT_RESUME_MOVEMENT",
  "DOTA_ABILITY_BEHAVIOR_IGNORE_BACKSWING",
  "DOTA_ABILITY_BEHAVIOR_TOGGLE",
  "DOTA_ABILITY_BEHAVIOR_IGNORE_PSEUDO_QUEUE",
  "DOTA_ABILITY_BEHAVIOR_SHOW_IN_GUIDES"
]);

const badNames = new Set([
  "Version",
  "npc_dota_hero_base",
  "npc_dota_hero_target_dummy",
  "npc_dota_units_base",
  "npc_dota_thinker",
  "npc_dota_companion",
  "npc_dota_loadout_generic",
  "npc_dota_techies_remote_mine",
  "npc_dota_treant_life_bomb",
  "npc_dota_lich_ice_spire",
  "npc_dota_mutation_pocket_roshan",
  "npc_dota_scout_hawk",
  "npc_dota_greater_hawk"
]);

const extraAttribKeys = [
  "AbilityCastRange",
  "AbilityChargeRestoreTime",
  "AbilityDuration",
  "AbilityChannelTime",
  "AbilityCastPoint",
  "AbilityCharges",
  "AbilityManaCost",
  "AbilityCooldown"
];

// Use standardized names for base attributes
const generatedHeaders = {
  "abilitycastrange": "CAST RANGE",
  "abilitycastpoint": "CAST TIME",
  "abilitycharges": "MAX CHARGES",
  "max_charges": "MAX CHARGES",
  "abilitychargerestoretime": "CHARGE RESTORE TIME",
  "charge_restore_time": "CHARGE RESTORE TIME",
  "abilityduration": "DURATION",
  "abilitychanneltime": "CHANNEL TIME"
};

// Already formatted for mc and cd
const excludeAttributes = new Set(["abilitymanacost", "abilitycooldown"]);

// Some attributes we remap, so keep track of them if there's dupes
const remapAttributes = {
  "abilitychargerestoretime": "charge_restore_time",
  "abilitycharges": "max_charges"
};

const notAbilities = new Set([
  "Version",
  "ability_base",
  "default_attack",
  "attribute_bonus",
  "ability_deward"
]);

const itemQualOverrides = {
  "fluffy_hat": "component",
  "ring_of_health": "secret_shop",
  "void_stone": "secret_shop",
  "overwhelming_blink": "artifact",
  "swift_blink": "artifact",
  "arcane_blink": "artifact",
  "moon_shard": "common",
  "aghanims_shard": "consumable",
  "kaya": "artifact",
  "helm_of_the_dominator": "common",
  "helm_of_the_overlord": "common",
  "desolator": "epic",
  "mask_of_madness": "common",
  "orb_of_corrosion": "common",
  "falcon_blade": "common",
  "mage_slayer": "artifact",
  "revenants_brooch": "epic"
}

let aghsAbilityValues = {};

const now = Number(new Date());

const aghs_desc_urls = [];

for (const hero_id in hero_list) {
  aghs_desc_urls.push(
    "http://www.dota2.com/datafeed/herodata?language=english&hero_id=" + hero_id
  );
}

function isObj(obj) {
  return obj !== null && obj !== undefined && typeof obj === "object" && !Array.isArray(obj);
}

const sources = [
  {
    key: "items",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/neutral_items.txt"
    ],
    transform: (respObj) => {
      const strings = respObj[0].lang.Tokens;
      const scripts = respObj[1].DOTAAbilities;
      const neutrals = respObj[2];
      // parse neutral items into name => tier map
      const neutralItemNameTierMap = getNeutralItemNameTierMap(neutrals);

      // Fix places where valve doesnt care about correct case
      Object.keys(strings).forEach((key) => {
        if (key.includes("DOTA_Tooltip_Ability_")) {
          strings[
            key.replace("DOTA_Tooltip_Ability_", "DOTA_Tooltip_ability_")
          ] = strings[key];
        }
      });

      let items = {};

      Object.keys(scripts)
        .filter((key) => {
          return (
            !(key.includes("item_recipe") && scripts[key].ItemCost === "0") &&
            key !== "Version"
          );
        })
        .forEach((key) => {
          const specialAttrs = getSpecialAttrs(scripts[key]);

          let item = {
            ...replaceSpecialAttribs(
              strings[`DOTA_Tooltip_ability_${key}_Description`],
              specialAttrs,
              true,
              scripts[key],
              key
            )
          };
          item.id = parseInt(scripts[key].ID);
          item.img = `/apps/dota2/images/dota_react/items/${key.replace(
            /^item_/,
            ""
          )}.png?t=${1593393829403}`;
          if (key.includes("item_recipe")) {
            item.img = `/apps/dota2/images/dota_react/items/recipe.png?t=${1593393829403}`;
          }

          item.dname = strings[`DOTA_Tooltip_ability_${key}`];
          item.qual = itemQualOverrides[key] ?? scripts[key].ItemQuality;
          item.cost = parseInt(scripts[key].ItemCost);

          let notes = [];
          for (
            let i = 0;
            strings[`DOTA_Tooltip_ability_${key}_Note${i}`];
            i++
          ) {
            notes.push(replaceSpecialAttribs(
              strings[`DOTA_Tooltip_ability_${key}_Note${i}`],
              specialAttrs,
              false,
              scripts[key],
              key
            ));
          }

          item.notes = notes.join("\n");

          item.attrib = formatAttrib(
            scripts[key].AbilitySpecial,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          ).filter((attr) => !attr.generated || attr.key === "lifetime");

          item.mc = parseInt(scripts[key].AbilityManaCost) || false;
          item.cd = parseInt(scripts[key].AbilityCooldown) || false;

          item.lore = (
            strings[`DOTA_Tooltip_ability_${key}_Lore`] || ""
          ).replace(/\\n/g, "\r\n");

          item.components = null;
          item.created = false;
          item.charges = parseInt(scripts[key].ItemInitialCharges) || false;
          if (neutralItemNameTierMap[key]) {
            item.tier = neutralItemNameTierMap[key];
          }
          items[key.replace(/^item_/, "")] = item;
        });

      // Load recipes
      Object.keys(scripts)
        .filter(
          (key) => scripts[key].ItemRequirements && scripts[key].ItemResult
        )
        .forEach((key) => {
          result_key = scripts[key].ItemResult.replace(/^item_/, "");
          items[result_key].components = scripts[key].ItemRequirements[0]
            .split(";")
            .map((item) => item.replace(/^item_/, "").replace("*", ""));
          items[result_key].created = true;
        });

      //Manually Adding DiffBlade2 for match data prior to 7.07
      items["diffusal_blade_2"] = {
        id: 196,
        img: "/apps/dota2/images/dota_react/items/diffusal_blade_2.png?3",
        dname: "Diffusal Blade",
        qual: "artifact",
        cost: 3850,
        desc: "Active: Purge Targets an enemy, removing buffs from the target and slowing it for 4 seconds.Range: 600\nPassive: ManabreakEach attack burns 50 mana from the target, and deals 0.8 physical damage per burned mana. Burns 16 mana per attack from melee illusions and 8 mana per attack from ranged illusions. Dispel Type: Basic Dispel",
        notes: "Does not stack with other manabreak abilities.",
        attrib: [
          {
            key: "bonus_agility",
            header: "",
            value: ["25", "35"],
            footer: "Agility"
          },
          {
            key: "bonus_intellect",
            header: "",
            value: ["10", "15"],
            footer: "Intelligence"
          },
          {
            key: "initial_charges",
            header: "INITIAL CHARGES:",
            value: "8",
            generated: true
          },
          {
            key: "feedback_mana_burn",
            header: "FEEDBACK MANA BURN:",
            value: "50",
            generated: true
          },
          {
            key: "feedback_mana_burn_illusion_melee",
            header: "FEEDBACK MANA BURN ILLUSION MELEE:",
            value: "16",
            generated: true
          },
          {
            key: "feedback_mana_burn_illusion_ranged",
            header: "FEEDBACK MANA BURN ILLUSION RANGED:",
            value: "8",
            generated: true
          },
          {
            key: "purge_summoned_damage",
            header: "PURGE SUMMONED DAMAGE:",
            value: "99999",
            generated: true
          },
          {
            key: "purge_rate",
            header: "PURGE RATE:",
            value: "5",
            generated: true
          },
          {
            key: "purge_root_duration",
            header: "PURGE ROOT DURATION:",
            value: "3",
            generated: true
          },
          {
            key: "purge_slow_duration",
            header: "PURGE SLOW DURATION:",
            value: "4",
            generated: true
          },
          {
            key: "damage_per_burn",
            header: "DAMAGE PER BURN:",
            value: "0.8",
            generated: true
          },
          {
            key: "cast_range_tooltip",
            header: "CAST RANGE TOOLTIP:",
            value: "600",
            generated: true
          }
        ],
        mc: false,
        cd: 4,
        lore: "An enchanted blade that allows the user to cut straight into the enemy's soul.",
        components: ["diffusal_blade", "recipe_diffusal_blade"],
        created: true
      };

      //Manually added for match data prior to 7.07
      items["recipe_iron_talon"] = {
        id: 238,
        img: "/apps/dota2/images/dota_react/items/recipe.png?3",
        dname: "Iron Talon Recipe",
        cost: 125,
        desc: "",
        notes: "",
        attrib: [],
        mc: false,
        cd: false,
        lore: "",
        components: null,
        created: false
      };

      return items;
    }
  },
  {
    key: "item_ids",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json",
    transform: (respObj) => {
      const items = respObj.DOTAAbilities;
      const itemIds = {};
      for (const key in items) {
        const item = items[key];
        if (typeof item === "object" && "ID" in item) {
          itemIds[item.ID] = key.replace("item_", "");
        }
      }
      //manually adding DiffBlade2
      itemIds[196] = "diffusal_blade_2";

      return itemIds;
    }
  },
  {
    key: "abilities",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json"
    ],
    transform: (respObj) => {
      const strings = respObj[0].lang.Tokens;
      const scripts = respObj[1].DOTAAbilities;

      let abilities = {};

      Object.keys(scripts)
        .filter((key) => !notAbilities.has(key))
        .forEach((key) => {
          let ability = {};

          let specialAttr = getSpecialAttrs(scripts[key]);

          ability.dname = replaceSValues(
            strings[`DOTA_Tooltip_ability_${key}`] ??
              strings[`DOTA_Tooltip_Ability_${key}`],
            specialAttr,
            key
          );

          // Check for unreplaced `s:bonus_<talent>`
          if (
            scripts[key].ad_linked_abilities &&
            scripts[scripts[key].ad_linked_abilities]
          ) {
            ability.dname = replaceBonusSValues(
              key,
              ability.dname,
              scripts[scripts[key].ad_linked_abilities].AbilityValues
            );
          }

          ability.behavior =
            formatBehavior(scripts[key].AbilityBehavior) || undefined;
          ability.dmg_type =
            formatBehavior(scripts[key].AbilityUnitDamageType) || undefined;
          ability.bkbpierce =
            formatBehavior(scripts[key].SpellImmunityType) || undefined;
          ability.dispellable =
            formatBehavior(scripts[key].SpellDispellableType) || undefined;
          ability.target_team =
            formatBehavior(scripts[key].AbilityUnitTargetTeam) || undefined;
          ability.target_type =
            formatBehavior(scripts[key].AbilityUnitTargetType) || undefined;

          ability.desc = replaceSpecialAttribs(
            strings[`DOTA_Tooltip_ability_${key}_Description`],
            specialAttr,
            false,
            scripts[key],
            key
          );
          ability.dmg =
            scripts[key].AbilityDamage &&
            formatValues(scripts[key].AbilityDamage);

          // Clean up duplicate remapped values (we needed dupes for the tooltip)
          if (specialAttr) {
            Object.entries(remapAttributes).forEach(([oldAttr, newAttr]) => {
              const oldAttrIdx = specialAttr.findIndex((attr) => Object.keys(attr)[0] === oldAttr);
              const newAttrIdx = specialAttr.findIndex((attr) => Object.keys(attr)[0] === newAttr);
              if (oldAttrIdx !== -1 && newAttrIdx !== -1) {
                specialAttr.splice(oldAttrIdx, 1);
              }
            });
          }

          ability.attrib = formatAttrib(
            specialAttr,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          );

          ability.lore = strings[`DOTA_Tooltip_ability_${key}_Lore`];

          const ManaCostKey = scripts[key].AbilityManaCost ?? scripts[key].AbilityValues?.AbilityManaCost;
          const CooldownKey = scripts[key].AbilityCooldown ?? scripts[key].AbilityValues?.AbilityCooldown;

          if (ManaCostKey) {
            const manaCost = isObj(ManaCostKey) ? ManaCostKey["value"] : ManaCostKey;
            ability.mc = formatValues(
              manaCost,
              false,
              "/"
            );
          }
          if (CooldownKey) {
            const cooldown = isObj(CooldownKey) ? CooldownKey["value"] : CooldownKey;
            ability.cd = formatValues(
              cooldown,
              false,
              "/"
            );
          }

          ability.img = `/apps/dota2/images/dota_react/abilities/${key}.png`;
          if (key.indexOf("special_bonus") === 0) {
            ability = { dname: ability.dname };
          }
          abilities[key] = ability;
          if (specialAttr) {
            let aghsObj = {};
            if (scripts[key].IsGrantedByScepter || scripts[key].IsGrantedByShard) {
              // simple straight copy to lookup
              for (const attrib of specialAttr) {
                for (const key of Object.keys(attrib)) {
                  const val = attrib[key];
                  if (isObj(val)) {
                    aghsObj[key] = val["value"];
                  } else {
                    aghsObj[key] = val;
                  }
                }
              }
            } else {
              for (const attrib of specialAttr) {
                for (const key of Object.keys(attrib)) {
                  const val = attrib[key];
                  if (val === null) {
                    continue;
                  }
                  // handle bonus objects
                  if (isObj(val)) {
                    // first case: standard attribute with aghs bonus
                    for (const bonus of Object.keys(val)) {
                      if (bonus.indexOf("scepter") !== -1 || bonus.indexOf("shard") !== -1) {
                        const rawBonus = val[bonus].replace("+", "")
                        .replace("-", "")
                        .replace("x", "")
                        .replace("%", "");
                        // bonus_bonus doesn't exist, it's shard_bonus or scepter_bonus at that point
                        const aghsPrefix = bonus.indexOf("scepter") !== -1 ? "scepter" : "shard";
                        const bonusKey = key.startsWith("bonus_") ? `${aghsPrefix}_${key}` : `bonus_${key}`;
                        aghsObj[bonusKey] = rawBonus;
                        aghsObj[`${key}`] = calculateValueFromBonus(val["value"], val[bonus]);
                      }
                    }
                    // second case: aghs bonus attribute
                    if (key.indexOf("scepter") !== -1 || key.indexOf("shard") !== -1) {
                      const bonus = Object.keys(val).filter(k => k !== key).find(k => k.indexOf("scepter") !== -1 || k.indexOf("shard") !== -1);
                      if (bonus) {
                        aghsObj[key] = calculateValueFromBonus(val["value"] ?? val[key], val[bonus]);
                      } else {
                        aghsObj[key] = val["value"] ?? val[key];
                      }
                    }
                    // third case: value requires aghs
                    if (Object.keys(val).length == 2) {
                      // value and requires attr
                      if (val["value"] && val["RequiresScepter"] || val["RequiresShard"]) {
                        aghsObj[key] = val["value"];
                      }
                    }
                  } else {
                    // simple key to value
                    aghsObj[key] = val;
                  }
                }
              }
            }
            aghsAbilityValues[key] = aghsObj;
          }
        });
      return abilities;
    }
  },
  {
    key: "ability_ids",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
    transform: (respObj) => {
      const abilityIds = {};
      for (const key in respObj.DOTAAbilities) {
        const block = respObj.DOTAAbilities[key];
        if (block && block.ID) {
          abilityIds[block.ID] = key;
        }
      }
      return abilityIds;
    }
  },
  {
    key: "neutral_abilities",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_units.json",
    transform: (respObj) => {
      const abilitySlots = [
        "Ability1",
        "Ability2",
        "Ability3",
        "Ability4",
        "Ability5",
        "Ability6",
        "Ability7",
        "Ability8"
      ];
      // filter out placeholder abilities
      const badNeutralAbilities = new Set([
        "creep_piercing",
        "creep_irresolute",
        "flagbearer_creep_aura_effect",
        "creep_siege",
        "backdoor_protection",
        "backdoor_protection_in_base",
        "filler_ability",
        "neutral_upgrade"
      ]);
      // filter out attachable units, couriers, buildings and siege creeps
      const badUnitRelationships = new Set([
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_ATTACHED",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_COURIER",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_BUILDING",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_BARRACKS",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_SIEGE"
      ]);
      const units = respObj.DOTAUnits;
      const baseUnit = units["npc_dota_units_base"];
      function getUnitProp(unit, prop, name = "") {
        if (unit[prop] !== undefined) {
          return unit[prop];
        }
        // include from other unit
        if (unit.include_keys_from) {
          return getUnitProp(units[unit.include_keys_from], prop);
        }
        // check if BaseClass is defined non-natively, if so, read from that
        // also make sure we aren't reading from itself
        if (unit.BaseClass && unit.BaseClass !== name && units[unit.BaseClass])
        {
          return getUnitProp(units[unit.BaseClass], prop, unit.BaseClass);
        }
        // Fallback to the base unit
        return baseUnit[prop];
      };
      const keys = Object.keys(units)
      .filter(
        (name) => {
          if (badNames.has(name)) {
            return false;
          }
          const unit = units[name];
          // only special units have a minimap icon
          if (unit.MinimapIcon) {
            return false;
          }
          if (getUnitProp(unit, "BountyXP") === "0") {
            return false;
          }
          // if HasInventory=0 explicitly (derived from hero), then we can filter it out
          // if it has an inventory, it's not an neutral
          if (unit.HasInventory === "0" || getUnitProp(unit, "HasInventory") === "1") {
            return false;
          }
          if (badUnitRelationships.has(getUnitProp(unit, "UnitRelationshipClass"))) {
            return false;
          }
          let hasAbility = false;
          for (const slot of abilitySlots) {
            const ability = getUnitProp(unit, slot);
            if (ability && !badNeutralAbilities.has(ability)) {
              hasAbility = true;
              break;
            }
          }
          return hasAbility;
        }
      );
      const neutralAbilities = {};
      keys.forEach((key) => {
        const unit = units[key];
        for (const slot of abilitySlots) {
          const ability = getUnitProp(unit, slot);
          if (ability && !badNeutralAbilities.has(ability) && !neutralAbilities[ability]) {
            neutralAbilities[ability] = {
              img: `/assets/images/dota2/neutral_abilities/${ability}.png`
            }
          }
        }
      });
      return neutralAbilities;
    }
  },
  {
    key: "ancients",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_units.json",
    transform: (respObj) => {
      // filter out attachable units, couriers, buildings and siege creeps
      const badUnitRelationships = new Set([
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_ATTACHED",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_COURIER",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_BUILDING",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_BARRACKS",
        "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_SIEGE"
      ]);
      const units = respObj.DOTAUnits;
      const baseUnit = units["npc_dota_units_base"];
      function getUnitProp(unit, prop, name = "") {
        if (unit[prop] !== undefined) {
          return unit[prop];
        }
        // include from other unit
        if (unit.include_keys_from) {
          return getUnitProp(units[unit.include_keys_from], prop);
        }
        // check if BaseClass is defined non-natively, if so, read from that
        // also make sure we aren't reading from itself
        if (unit.BaseClass && unit.BaseClass !== name && units[unit.BaseClass])
        {
          return getUnitProp(units[unit.BaseClass], prop, unit.BaseClass);
        }
        // Fallback to the base unit
        return baseUnit[prop];
      };
      const keys = Object.keys(units)
      .filter(
        (name) => {
          if (badNames.has(name)) {
            return false;
          }
          const unit = units[name];
          // only special units have a minimap icon
          if (unit.MinimapIcon) {
            return false;
          }
          if (getUnitProp(unit, "BountyXP") === "0") {
            return false;
          }
          // if HasInventory=0 explicitly (derived from hero), then we can filter it out
          // if it has an inventory, it's not an neutral
          if (unit.HasInventory === "0" || getUnitProp(unit, "HasInventory") === "1") {
            return false;
          }
          if (getUnitProp(unit, "UnitRelationshipClass") !== "DOTA_NPC_UNIT_RELATIONSHIP_TYPE_DEFAULT") {
            return false;
          }
          const level = getUnitProp(unit, "Level");
          if (level === "0" || level === "1") {
            return false;
          }
          if (getUnitProp(unit, "TeamName") !== "DOTA_TEAM_NEUTRALS") {
            return false;
          }
          if (getUnitProp(unit, "IsNeutralUnitType") === "0") {
            return false;
          }
          if (getUnitProp(unit, "IsRoshan") === "1") {
            return false;
          }
          return getUnitProp(unit, "IsAncient") === "1";
        }
      );
      const ancients = {};
      keys.forEach((key) => {
        ancients[key] = 1;
      });
      return ancients;
    }
  },
  {
    key: "heroes",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj) => {
      let heroes = [];
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.has(name)
      );
      keys.forEach((name) => {
        let h = formatVpkHero(name, respObj[1], respObj[2].lang.Tokens[`${name}:n`]);
        h.localized_name =
          h.localized_name ||
          respObj[1]["DOTAHeroes"][name].workshop_guide_name;
        h.localized_name = h.localized_name || respObj[0].lang.Tokens[name];
        heroes.push(h);
      });
      heroes = heroes.sort((a, b) => a.id - b.id);
      let heroesObj = {};
      for (hero of heroes) {
        hero.id = Number(hero.id);
        heroesObj[hero.id] = hero;
      }
      return heroesObj;
    }
  },
  {
    key: "hero_names",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj) => {
      let heroes = [];
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.has(name)
      );
      keys.forEach((name) => {
        let h = formatVpkHero(name, respObj[1], respObj[2].lang.Tokens[`${name}:n`]);
        h.localized_name =
          h.localized_name ||
          respObj[1]["DOTAHeroes"][name].workshop_guide_name;
        h.localized_name = h.localized_name || respObj[0].lang.Tokens[name];
        heroes.push(h);
      });
      heroes = heroes.sort((a, b) => a.id - b.id);
      let heroesObj = {};
      for (hero of heroes) {
        hero.id = Number(hero.id);
        heroesObj[hero.name] = hero;
      }
      return heroesObj;
    }
  },
  {
    key: "hero_lore",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/hero_lore_english.txt",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
    ],
    transform: (respObj) => {
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.has(name)
      );
      let sortedHeroes = [];
      keys.forEach((name) => {
        const hero = respObj[1].DOTAHeroes[name];
        sortedHeroes.push({name, id: hero.HeroID})
      })
      sortedHeroes = sortedHeroes.sort((a, b) => a.id - b.id);
      const lore = respObj[0].tokens;
      const heroLore = {};
      sortedHeroes.forEach((hero) => {
        const heroKey = hero.name.replace("npc_dota_hero_", "");
        heroLore[heroKey] = lore[`${hero.name}_bio`]
          .replace(/\t+/g, " ")
          .replace(/\n+/g, " ")
          .replace(/<br>+/g, " ")
          .replace(/\s+/g, " ")
          .replace(/\\/g, "")
          .replace(/"/g, "'")
          .trim();
      });
      return heroLore;
    }
  },
  {
    key: "hero_abilities",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
    transform: (respObj) => {
      let DOTAHeroes = respObj.DOTAHeroes;
      const heroAbilities = {};
      Object.keys(DOTAHeroes).forEach(function (heroKey) {
        if (
          heroKey != "Version" &&
          heroKey != "npc_dota_hero_base" &&
          heroKey != "npc_dota_hero_target_dummy"
        ) {
          const newHero = { abilities: [], talents: [] };
          let talentCounter = 2;
          Object.keys(DOTAHeroes[heroKey]).forEach(function (key) {
            let talentIndexStart =
              DOTAHeroes[heroKey]["AbilityTalentStart"] != undefined
                ? DOTAHeroes[heroKey]["AbilityTalentStart"]
                : 10;
            let abilityRegexMatch = key.match(/Ability([0-9]+)/);
            if (abilityRegexMatch && DOTAHeroes[heroKey][key] != "") {
              let abilityNum = parseInt(abilityRegexMatch[1]);
              if (abilityNum < talentIndexStart) {
                newHero["abilities"].push(DOTAHeroes[heroKey][key]);
              } else {
                // -8 not -10 because going from 0-based index -> 1 and flooring divison result
                newHero["talents"].push({
                  name: DOTAHeroes[heroKey][key],
                  level: Math.floor(talentCounter / 2)
                });
                talentCounter++;
              }
            }
          });
          heroAbilities[heroKey] = newHero;
        }
      });
      return heroAbilities;
    }
  },
  {
    key: "region",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
    transform: (respObj) => {
      const region = {};
      const regions = respObj.regions;
      for (const key in regions) {
        if (Number(regions[key].region) > 0) {
          region[regions[key].region] = regions[key].display_name
            .slice("#dota_region_".length)
            .split("_")
            .map((s) => s.toUpperCase())
            .join(" ");
        }
      }
      return region;
    }
  },
  {
    key: "cluster",
    url: "https://api.stratz.com/api/v1/Cluster",
    transform: (respObj) => {
      const cluster = {};
      respObj.forEach(({ id, regionId }) => {
        cluster[id] = regionId;
      });
      return cluster;
    }
  },
  {
    key: "countries",
    url: "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
    transform: (respObj) => {
      const countries = {};
      respObj
        .map((c) => ({
          name: {
            common: c.name.common
          },
          cca2: c.cca2
        }))
        .forEach((c) => {
          countries[c.cca2] = c;
        });
      return countries;
    }
  },
  {
    key: "chat_wheel",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/chat_wheel.txt",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/hero_chat_wheel_english.txt"
    ],
    transform: (respObj) => {
      const chat_wheel = respObj[0];
      const lang = respObj[1].lang.Tokens;
      const chat_wheel_lang = respObj[2];

      const result = {};

      function localize(input) {
        if (!/^#/.test(input)) {
          return input;
        }
        let key = input.replace(/^#/, "");
        return lang[key] || chat_wheel_lang[key] || key;
      }

      function addMessage(key, message) {
        let data = {
          id: parseInt(message.message_id),
          name: key,
          all_chat: message.all_chat == "1" ? true : undefined,
          label: localize(message.label),
          message: localize(message.message),
          image: message.image,
          badge_tier: message.unlock_hero_badge_tier
        };
        if (message.sound) {
          if (/^soundboard\./.test(message.sound) || /^wisp_/.test(key)) {
            // All of the soundboard clips and the IO responses are wav files
            data.sound_ext = "wav";
          } else if (message.message_id / 1000 >= 121) {
            // Gets the hero id from the message id
            // If the hero is grimstroke or newer, the files are aac
            data.sound_ext = "aac";
          } else {
            // All other response clips used are mp3s
            data.sound_ext = "mp3";
          }
        }
        result[data.id] = data;
      }

      for (let key in chat_wheel.messages) {
        addMessage(key, chat_wheel.messages[key]);
      }
      for (let hero_id in chat_wheel.hero_messages) {
        for (let key in chat_wheel.hero_messages[hero_id]) {
          addMessage(key, chat_wheel.hero_messages[hero_id][key]);
        }
      }
      return result;
    }
  },
  {
    key: "patchnotes",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/patchnotes/patchnotes_english.txt",
    transform: (respObj) => {
      let items = Object.keys(require("../build/items.json"));
      let heroes = Object.keys(require("../build/hero_names.json")).map(
        (hero) => hero.replace("npc_dota_hero_", "")
      );

      let result = {};
      let keys = Object.keys(respObj);
      for (let key of keys) {
        let keyArr = key.replace("dota_patch_", "").split("_");
        let patch = keyArr.splice(0, 2).join("_");
        if (!result[patch])
          result[patch] = {
            general: [],
            items: {},
            heroes: {}
          };

        if (keyArr[0].toLowerCase() == "general") {
          result[patch].general.push(respObj[key]);
        } else if (keyArr[0] == "item") {
          let searchName = keyArr.slice(1);
          let itemName = parseNameFromArray(searchName, items);
          if (itemName) {
            if (!result[patch].items[itemName])
              result[patch].items[itemName] = [];
            result[patch].items[itemName].push(respObj[key]);
          } else {
            if (!result[patch].items.misc) result[patch].items.misc = [];
            result[patch].items.misc.push(respObj[key]);
          }
        } else {
          let heroName = parseNameFromArray(keyArr, heroes);
          if (heroName) {
            if (!result[patch].heroes[heroName])
              result[patch].heroes[heroName] = [];
            result[patch].heroes[heroName].push(respObj[key]);
          } else {
            if (!result[patch].heroes.misc) result[patch].heroes.misc = [];
            result[patch].heroes.misc.push(respObj[key]);
          }
        }
      }

      return result;
    }
  },
  {
    key: "aghs_desc",
    url: aghs_desc_urls,
    transform: (respObj) => {
      const herodata = respObj;
      aghs_desc_arr = [];

      // for every hero
      herodata.forEach((hd_hero) => {
        if (!hd_hero) {
          return;
        }
        hd_hero = hd_hero.result.data.heroes[0];

        // object to store data about aghs scepter/shard for a hero
        let aghs_element = {
          hero_name: hd_hero.name,
          hero_id: hd_hero.id,

          has_scepter: false,
          scepter_desc: "",
          scepter_skill_name: "",
          scepter_new_skill: false,

          has_shard: false,
          shard_desc: "",
          shard_skill_name: "",
          shard_new_skill: false
        };

        hd_hero.abilities.forEach((ability) => {
          // skip unused skills
          if (ability.name_loc == "" || ability.desc_loc == "") {
            return; // i guess this is continue in JS :|
          }

          let scepterName = null;
          let shardName = null;

          // ------------- Scepter  -------------
          if (ability.ability_is_granted_by_scepter) {
            // scepter grants new ability
            aghs_element.scepter_desc = ability.desc_loc;
            aghs_element.scepter_skill_name = ability.name_loc;
            scepterName = ability.name;
            aghs_element.scepter_new_skill = true;
            aghs_element.has_scepter = true;
          } else if (
            ability.ability_has_scepter &&
            !(ability.scepter_loc == "")
          ) {
            // scepter ugprades an ability
            aghs_element.scepter_desc = ability.scepter_loc;
            aghs_element.scepter_skill_name = ability.name_loc;
            scepterName = ability.name;
            aghs_element.scepter_new_skill = false;
            aghs_element.has_scepter = true;
          }
          // -------------- Shard  --------------
          if (ability.ability_is_granted_by_shard) {
            // scepter grants new ability
            aghs_element.shard_desc = ability.desc_loc;
            aghs_element.shard_skill_name = ability.name_loc;
            shardName = ability.name;
            aghs_element.shard_new_skill = true;
            aghs_element.has_shard = true;
          } else if (ability.ability_has_shard && !(ability.shard_loc == "")) {
            // scepter ugprades an ability
            aghs_element.shard_desc = ability.shard_loc;
            aghs_element.shard_skill_name = ability.name_loc;
            shardName = ability.name;
            aghs_element.shard_new_skill = false;
            aghs_element.has_shard = true;
          }
          if (scepterName) {
            const values = aghsAbilityValues[scepterName];
            aghs_element.scepter_desc = aghs_element.scepter_desc.replace(/%([^% ]*)%/g, findAghsAbilityValue(values));
          }
          if (shardName) {
            const values = aghsAbilityValues[shardName];
            aghs_element.shard_desc = aghs_element.shard_desc.replace(/%([^% ]*)%/g, findAghsAbilityValue(values));
          }
          // clean up <br> and double % signs
          aghs_element.scepter_desc = aghs_element.scepter_desc.replace(/<br>/gi, "\n").replace("%%", "%");
          aghs_element.shard_desc = aghs_element.shard_desc.replace(/<br>/gi, "\n").replace("%%", "%");
        });

        // Error handling
        if (!aghs_element.has_shard) {
          console.log(
            aghs_element.hero_name +
              "[" +
              aghs_element.hero_id +
              "]" +
              ": Didn't find a scepter..."
          );
        }
        if (!aghs_element.has_scepter) {
          console.log(
            aghs_element.hero_name +
              "[" +
              aghs_element.hero_id +
              "]" +
              ": Didn't find a shard..."
          );
        }
        // push the current hero"s element into the array
        aghs_desc_arr.push(aghs_element);
      });

      return aghs_desc_arr;
    }
  }
];

function getSpecialAttrs(entity) {
  let specialAttr = entity.AbilitySpecial;
  if (!specialAttr) {
    specialAttr = entity.AbilityValues;
    if (specialAttr) {
      specialAttr = Object.keys(specialAttr).map((attr) => ({
        [attr]: specialAttr[attr]
      }));
    }
  } else {
    // Fix weird attrib formatting on very rare cases.
    // e.g.: spirit_breaker_empowering_haste
    if (!Array.isArray(specialAttr) && typeof specialAttr == "object") {
      specialAttr = Object.keys(specialAttr).map((key) => {
        return specialAttr[key];
      });
    }
  }
  return specialAttr;
}

function calculateValueFromBonus(value, bonus) {
  const rawBonus = bonus.replace("+", "")
                        .replace("-", "")
                        .replace("x", "")
                        .replace("%", "");
  if (value === undefined) {
    return rawBonus;
  }
  const baseValue = parseFloat(value);
  let ret = rawBonus;
  // if the base value is non-zero
  if (baseValue !== 0) {
    let bonusMultiplier = bonus;
    if (bonusMultiplier.indexOf("%") !== -1) {
      bonusMultiplier = bonusMultiplier.replace("%", "");
      if (bonusMultiplier[0] === "+") {
        bonusMultiplier = bonusMultiplier.replace("+", "");
        bonusMultiplier = 1 + parseFloat(bonusMultiplier) / 100.0;
      } else if (bonusMultiplier[0] === "-") {
        bonusMultiplier = bonusMultiplier.replace("-", "");
        bonusMultiplier = parseFloat(bonusMultiplier) / 100.0;
      }
      return baseValue * bonusMultiplier;
    } else if (bonusMultiplier[0] === "+" || bonusMultiplier[0] === "-") {
      let bonusTerm = parseFloat(rawBonus);
      if (bonusMultiplier[0] === "+") {
        return baseValue + bonusTerm;
      } else {
        return baseValue - bonusTerm;
      }
    } else {
      return baseValue + parseFloat(bonus);
    }
  }
  let int = Math.floor(ret);
  if (int == ret) {
    return int;
  }
  return ret;
}

function findAghsAbilityValue(values) {
  return function(str, name) {
    if (name == "") {
      return "%";
    }
    let orig = `%${name}%`;
    name = name.toLowerCase();
    return values[name] ?? orig;
  }
}

const patches = JSON.parse(fs.readFileSync("./json/patch.json"));
const newPatches = [];
const lastPatch = patches[patches.length - 1];
const today = new Date();
const dayDifference = Math.ceil(
  Math.abs(today.getTime() - new Date(lastPatch.date).getTime()) /
    (1000 * 3600 * 24)
);
patches.forEach((p, i) => {
  newPatches.push({ ...p, id: i });
});
/*
if (dayDifference > 14) {
  const n = Math.floor(dayDifference / 14)
  for (let i = 0; i < n; i += 1) {
    const versionNum = parseFloat(patches[patches.length - 1].name, 10) + 0.01
    const date = new Date(patches[patches.length - 1].date)
    patches.push({ id: i, name: versionNum.toFixed(2), date: new Date(date.getTime() + 60 * 60 * 24 * 1000 * 14) })
  }
}
*/
fs.writeFileSync("./json/patch.json", JSON.stringify(newPatches, null, 1));

// "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
// "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
// "leagues": "https://api.opendota.com/api/leagues",
async.each(
  sources,
  function (s, cb) {
    const url = s.url;
    const options = {};
     if (typeof url === 'string' && url.startsWith("https://api.stratz.com")) {
       // if no token set, skip request to not overwrite data
       if (STRATZ_TOKEN.length === 0) return cb();
       options.auth = { bearer: STRATZ_TOKEN };
     }
    //grab raw data from each url and save
    console.log(url);
    if (typeof url === "object") {
      async.map(
        url,
        (urlString, cb) => {
          request(urlString, options, (err, resp, body) => {
            cb(err, parseJson(body));
          });
        },
        (err, resultArr) => {
          handleResponse(
            err,
            {
              statusCode: 200
            },
            JSON.stringify(resultArr)
          );
        }
      );
    } else {
      request(url, options, handleResponse);
    }

    function parseJson(text) {
      try {
        return JSON.parse(text);
      } catch (err) {
        try {
          let vdf = simplevdf.parse(text);
          vdf = vdf[Object.keys(vdf)[0]];
          let keys = Object.keys(vdf);
          let normalized = {};
          for (let key of keys) {
            normalized[key.toLowerCase()] = vdf[key];
          }
          return normalized;
        } catch {
          console.log(text);
          return {};
        }
      }
    }

    function handleResponse(err, resp, body) {
      if (err || resp.statusCode !== 200) {
        return cb(err);
      }
      body = parseJson(body);
      if (s.transform) {
        body = s.transform(body);
      }
      fs.writeFileSync(
        "./build/" + s.key + ".json",
        JSON.stringify(body, null, 2)
      );
      cb(err);
    }
  },
  function (err) {
    if (err) {
      throw err;
    }
    // Copy manual json files to build
    const jsons = fs.readdirSync("./json");
    jsons.forEach((filename) => {
      fs.writeFileSync(
        "./build/" + filename,
        fs.readFileSync("./json/" + filename, "utf-8")
      );
    });
    // Reference built files in index.js
    const cfs = fs.readdirSync("./build");
    // Exports aren"t supported in Node yet, so use old export syntax for now
    // const code = cfs.map((filename) => `export const ${filename.split(".")[0]} = require(__dirname + "/json/${filename.split(".")[0]}.json");`).join("\n";
    const code = `module.exports = {
${cfs
  .map(
    (filename) =>
      `${filename.split(".")[0]}: require(__dirname + "/build/${
        filename.split(".")[0]
      }.json")`
  )
  .join(",\n")}
};`;
    fs.writeFileSync("./index.js", code);
    process.exit(0);
  }
);

function expandItemGroup(key, items) {
  let base = [key];
  if (items[key] && items[key].components) {
    return [].concat.apply(
      base,
      items[key].components.map(function (c) {
        return expandItemGroup(c, items);
      })
    );
  } else {
    return base;
  }
}

function replaceUselessDecimals(strToReplace) {
  return strToReplace.replace(/\.0+(\D)/, "$1");
}

// Formats something like "20 21 22" or [ 20, 21, 22 ] to be "20 / 21 / 22"
function formatValues(value, percent = false, separator = " / ") {
  let values = Array.isArray(value) ? value : String(value).split(" ");
  if (values.every((v) => v == values[0])) {
    values = [values[0]];
  }
  if (percent) {
    values = values.map((v) => v + "%");
  }
  let len = values.length;
  let res = values.join(separator).replace(/\.0+(\D|$)/g, "$1");
  return len > 1 ? res.split(separator) : res;
}

// Formats AbilitySpecial for the attrib value for abilities and items
function formatAttrib(attributes, strings, strings_prefix) {
  if (attributes && !Array.isArray(attributes))
    attributes = Object.values(attributes);
  return (attributes || [])
    .filter((attr) => !excludeAttributes.has(Object.keys(attr)[0].toLowerCase()))
    .map((attr) => {
      let key = Object.keys(attr).find(
        (key) => `${strings_prefix}${key.toLowerCase()}` in strings
      );
      if (!key) {
        for (item in attr) {
          key = item;
          break;
        }
        if (attr[key] === null) {
          return null;
        }
        const headerName = generatedHeaders[key] ?? key.replace(/_/g, " ").toUpperCase();
        const values = isObj(attr[key]) ? attr[key].value : attr[key];
        if (values === undefined)
        {
          return null;
        }
        return {
          key: key,
          header: `${headerName}:`,
          value: formatValues(values),
          generated: true
        };
      }

      let final = { key: key };
      let header = strings[`${strings_prefix}${key.toLowerCase()}`];
      let match = header.match(/(%)?(\+\$)?(.*)/);
      header = match[3];
      if (attr[key] === null) {
        return null;
      }
      const values = isObj(attr[key]) ? attr[key].value : attr[key];
      if (values === undefined)
      {
        return null;
      }

      if (match[2]) {
        final.header = "+";
        final.value = formatValues(values, match[1]);
        final.footer = strings[`dota_ability_variable_${header}`];
        if (header.includes("attack_range"))
          final.footer = final.footer.replace(/<[^>]*>/g, "");
      } else {
        final.header = header.replace(/<[^>]*>/g, "");
        final.value = formatValues(values, match[1]);
      }

      return final;
    })
    .filter((a) => a);
}

let specialBonusLookup = {};

function replaceSValues(template, attribs, key) {
  let values = specialBonusLookup[key] ?? {};
  if (template && (attribs && Array.isArray(attribs) || Object.keys(values).length)) {
    (attribs || []).forEach((attrib) => {
      for (const key of Object.keys(attrib)) {
        let val = attrib[key];
        if (val === null) {
          continue;
        }
        if (isObj(val)) {
          values[key] = val["value"];
          const specialBonusKey = Object.keys(val).find(key => key.startsWith("special_bonus_"));
          if (specialBonusKey) {
            const bonusKey = `bonus_${key}`;
            // remove redundant signs
            const specialBonusVal = val[specialBonusKey]
              .replace("+", "")
              .replace("-", "")
              .replace("x", "")
              .replace("%", "");
            if (specialBonusKey in specialBonusLookup) {
              specialBonusLookup[specialBonusKey][bonusKey] = specialBonusVal;
            } else {
              // sometimes special bonuses look up by the value key rather than the bonus name.
              specialBonusLookup[specialBonusKey] = {[bonusKey]: specialBonusVal, value: specialBonusVal};
            }
          }
        } else {
          values[key] = val;
        }
      }
    });
    Object.keys(values).forEach((key) => {
      if (typeof values[key] != "object") {
        template = template.replace(`{s:${key}}`, values[key]);
      }
    });
  }
  return template;
}

function replaceBonusSValues(key, template, attribs) {
  if (template && attribs) {
    Object.keys(attribs).forEach((bonus) => {
      if (
        typeof attribs[bonus] == "object" &&
        attribs[bonus]?.hasOwnProperty(key)
      ) {
        // remove redundant signs
        let bonus_value = attribs[bonus][key]
          .replace("+", "")
          .replace("-", "")
          .replace("x", "");

        template = template
          // Most of the time, the bonus value template is named bonus_<bonus_key>
          .replace(`{s:bonus_${bonus}}`, bonus_value)
          // But sometimes, it"s just value
          .replace(`{s:value}`, bonus_value);
      }
    });
  }
  return template;
}

// Formats templates like "Storm"s movement speed is %storm_move_speed%" with "Storm"s movement speed is 32"
// args are the template, and a list of attribute dictionaries, like the ones in AbilitySpecial for each ability in the npc_abilities.json from the vpk
function replaceSpecialAttribs(
  template,
  attribs,
  isItem = false,
  allData = {},
  key // For error tracing
) {
  if (!template) {
    return template;
  }

  if (attribs) {
    attribs.forEach((attr) => {
      const keys = Object.entries(attr);
      for (const [key, val] of keys) {
        const name = key.toLowerCase();
        if (name !== key) {
          delete attr[key];
          attr[name] = val;
        }
      }
    });
    //additional special ability keys being catered
    extraAttribKeys.forEach((abilitykey) => {
      if (abilitykey in allData) {
        let abilityValue = isObj(allData[abilitykey]) ? allData[abilitykey].value : allData[abilitykey];
        let value = abilityValue.split(" "); //can have multiple values
        value =
          value.length === 1 ? Number(value[0]) : value.map((v) => Number(v));
        abilitykey = abilitykey.toLowerCase();
        attribs.push({ [abilitykey]: value });
        // these are also present with another attrib name
        if (remapAttributes[abilitykey]) {
          attribs.push({ [remapAttributes[abilitykey]]: value });
        }
      }
    });

    if (template.includes("%customval_team_tomes_used%")) {
      //in-game line not required in tooltip
      template = template.replace(/[ a-zA-Z]+: %\w+%/g, "");
    }

    template = template.replace(/%([^% ]*)%/g, function (str, name) {
      if (name == "") {
        return "%";
      }
      let orig = `%${name}%`;
      name = name.toLowerCase();
      if (!Array.isArray(attribs)) attribs = Object.values(attribs);
      let attr = attribs.find((attr) => name in attr);
      if (!attr && name[0] === "d") {
        // Because someone at valve messed up in 4 places
        name = name.substr(1);
        attr = attribs.find((attr) => name in attr);
      }
      if (!attr) {
        if (name === "lifesteal") {
          //special cases, in terms of template context and dota2 gamepedia
          return attribs.find((obj) => "lifesteal_percent" in obj)
            .lifesteal_percent;
        } else if (name === "movement_slow") {
          return attribs.find((obj) => "damage_pct" in obj).damage_pct;
        }

        console.log(`cant find attribute %${name}% in %${key}% with ${attribs.map(o => Object.keys(o)[0])}`);
        return `%${name}%`;
      }

      let ret;

      if (attr[name].value !== undefined) {
        ret = attr[name].value;
      } else {
        ret = attr[name];
      }

      if (ret === undefined) {
        return orig;
      } else {
        let float = parseFloat(ret);
        if (float) {
          let int = Math.floor(float);
          if (ret == int) {
            return int;
          }
          return float;
        } else {
          return ret;
        }
      }
    });
  }
  template = template.replace(/<br>/gi, "\n").replace("%%", "%");
  // replace close tags with a space, but not open tags
  template = template.replace(/(<(\/[^>]+)>)/gi, " ").replace(/(<([^>]+)>)/gi, "");
  // replace double spaces
  template = template.replace("  ", " ");
  if (isItem) {
    const abilities = template.split("\\n");
    return {
      hint: cleanupArray(abilities)
    };
  }
  template = template.replace(/\\n/g, "\n");
  return template;
}

function formatBehavior(string) {
  if (!string) return false;

  let split = string
    .split(" | ")
    .filter(
      (item) =>
        !ignoreStrings.has(item.trim()) &&
        extraStrings.hasOwnProperty(item.trim())
    )
    .map((item) => {
      return extraStrings[item.trim()];
    });

  if (split.length === 1) {
    return split[0];
  } else {
    return split;
  }
}

function formatVpkHero(key, vpkr, localized_name) {
  let h = {};

  let vpkrh = vpkr.DOTAHeroes[key];
  let baseHero = vpkr.DOTAHeroes.npc_dota_hero_base;

  h.id = vpkrh.HeroID;
  h.name = key;
  h.localized_name = localized_name;

  h.primary_attr = vpkrh.AttributePrimary.replace("DOTA_ATTRIBUTE_", "")
    .slice(0, 3)
    .toLowerCase();
  h.attack_type =
    vpkrh.AttackCapabilities == "DOTA_UNIT_CAP_MELEE_ATTACK"
      ? "Melee"
      : "Ranged";
  h.roles = vpkrh.Role.split(",");

  h.img =
    "/apps/dota2/images/dota_react/heroes/" +
    key.replace("npc_dota_hero_", "") +
    ".png?";
  h.icon =
    "/apps/dota2/images/dota_react/heroes/icons/" +
    key.replace("npc_dota_hero_", "") +
    ".png?";
  h.url = vpkrh.url;

  h.base_health = Number(vpkrh.StatusHealth || baseHero.StatusHealth);
  h.base_health_regen = Number(
    vpkrh.StatusHealthRegen || baseHero.StatusHealthRegen
  );
  h.base_mana = Number(vpkrh.StatusMana || baseHero.StatusMana);
  h.base_mana_regen = Number(vpkrh.StatusManaRegen || baseHero.StatusManaRegen);
  h.base_armor = Number(vpkrh.ArmorPhysical || baseHero.ArmorPhysical);
  h.base_mr = Number(vpkrh.MagicalResistance || baseHero.MagicalResistance);

  h.base_attack_min = Number(vpkrh.AttackDamageMin || baseHero.AttackDamageMin);
  h.base_attack_max = Number(vpkrh.AttackDamageMax || baseHero.AttackDamageMax);

  h.base_str = Number(vpkrh.AttributeBaseStrength);
  h.base_agi = Number(vpkrh.AttributeBaseAgility);
  h.base_int = Number(vpkrh.AttributeBaseIntelligence);

  h.str_gain = Number(vpkrh.AttributeStrengthGain);
  h.agi_gain = Number(vpkrh.AttributeAgilityGain);
  h.int_gain = Number(vpkrh.AttributeIntelligenceGain);

  h.attack_range = Number(vpkrh.AttackRange);
  h.projectile_speed = Number(
    vpkrh.ProjectileSpeed || baseHero.ProjectileSpeed
  );
  h.attack_rate = Number(vpkrh.AttackRate || baseHero.AttackRate);
  h.base_attack_time = Number(vpkrh.BaseAttackSpeed || baseHero.BaseAttackSpeed);
  h.attack_point = Number(vpkrh.AttackAnimationPoint || baseHero.AttackAnimationPoint);

  h.move_speed = Number(vpkrh.MovementSpeed);
  h.turn_rate = Number(vpkrh.MovementTurnRate);

  h.cm_enabled = vpkrh.CMEnabled === "1" ? true : false;
  h.legs = Number(vpkrh.Legs || baseHero.Legs);

  h.day_vision = Number(vpkrh.VisionDaytimeRange || baseHero.VisionDaytimeRange);
  h.night_vision = Number(vpkrh.VisionNighttimeRange || baseHero.VisionNighttimeRange);

  return h;
}

function parseNameFromArray(array, names) {
  let final = [];
  for (let i = 1; i <= array.length; i++) {
    let name = array.slice(0, i).join("_");
    if (names.includes(name)) {
      final.push(name);
    }
  }
  return final.map((a) => a)[0];
}

const getNeutralItemNameTierMap = (neutrals) => {
  let ret = {};
  Object.keys(neutrals).forEach((tier) => {
    let items = neutrals[tier].items;
    Object.keys(items).forEach((itemName) => {
      ret[itemName] = ret[itemName.replace(/recipe_/gi, "")] = parseInt(tier);
    });
  });
  return ret;
};
