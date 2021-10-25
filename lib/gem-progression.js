const { ArgumentParser } = require('argparse')
const http = require('http')
const { uniqBy, prop, differenceWith } = require('ramda')
const { getData, loadYaml } = require('./common')

const SHARED_GROUP = 9999
const MAX_LINK = 6
const CLASS_SPLIT = '�'
const HEADER = 'The gems and setup below are sorted vertically based on priority, where stuff on bottom is less important in each level breakpoint section. Gem names that are italic are the ones that changed since previous level breakpoint.'

function prepareRewards (rewards) {
  return rewards.filter(r => !r.rarity)
    .map(r => {
      r.classes = r.classes || ''
      r.classes = r.classes.split(CLASS_SPLIT).filter(c => !!c)
      return r
    })
}

function actToVendor (act) {
  switch (act) {
    case 1:
      return 'Nessa'
    case 2:
      return 'Yeena'
    case 3:
      return 'Clarissa'
    case 4:
    case 9:
      return 'Petarus and Vanja'
    case 6:
    case 10:
      return 'Lilly Roth'
  }

  return undefined
}

function buildGemData () {
  const questRewards = prepareRewards(getData('quest-rewards.lua'))
  const vendorRewards = prepareRewards(getData('vendor-rewards.lua'))
  const gemsData = getData('gems.json')

  questRewards.forEach(q => {
    const v = vendorRewards.find(v => v.npc && v.quest === q.quest)
    if (v) {
      q.npc = v.npc
    } else {
      q.npc = actToVendor(q.act)
    }
  })

  return Object.values(gemsData).map(gemData => {
    const baseItem = gemData.base_item

    if (!baseItem) {
      return undefined
    }

    const displayName = baseItem.display_name

    if (!displayName) {
      return undefined
    }

    const stats = gemData.per_level['1']

    if (!stats) {
      return undefined
    }

    const tags = gemData.tags

    let primaryAttribute = ''

    if (tags.includes('intelligence')) {
      primaryAttribute = 'intelligence'
    } else if (tags.includes('dexterity')) {
      primaryAttribute = 'dexterity'
    } else if (tags.includes('strength')) {
      primaryAttribute = 'strength'
    }

    const gem = {}
    gem.name = displayName
    gem.primary_attr = primaryAttribute
    gem.required_level = stats.required_level
    gem.quest_rewards = []
    gem.vendor_rewards = []

    for (const reward of questRewards) {
      if (gem.name.toLowerCase().startsWith(reward.reward.toLowerCase())) {
        gem.quest_rewards.push(reward)
      }
    }

    for (const reward of vendorRewards) {
      if (gem.name.toLowerCase().startsWith(reward.reward.toLowerCase())) {
        gem.vendor_rewards.push(reward)
      }
    }

    return gem
  }).filter(g => !!g)
}

function getColor (gem) {
  const stat = gem.primary_attr

  if (stat === 'intelligence') {
    return '#005DC2'
  }

  if (stat === 'dexterity') {
    return '#17B529'
  }

  if (stat === 'strength') {
    return '#E82A1F'
  }

  return '#FFFFFF'
}

function getLevelReq (gem) {
  return gem.required_level
}

function getReward (gem, clazz) {
  let reward = gem.quest_rewards.find(r => r.classes.length === 0 || r.classes.includes(clazz))

  if (!reward) {
    reward = gem.vendor_rewards.find(r => r.classes.length === 0 || r.classes.includes(clazz))
  }

  if (reward) {
    return {
      act: reward.act,
      npc: reward.npc,
      quest: reward.quest
    }
  }

  return {}
}

function findGem (name, gems, clazz) {
  for (const gem of gems) {
    const gemName = gem.name

    if (gemName.toLowerCase().startsWith(name.toLowerCase())) {
      return {
        name: gemName,
        color: getColor(gem),
        level: getLevelReq(gem),
        reward: getReward(gem, clazz)
      }
    }
  }

  console.warn(`Failed to find skill ${name}`)
  return undefined
}

function createSkill (skill, gems, clazz) {
  const gem = findGem(skill.name, gems, clazz)

  if (!gem) {
    return gem
  }

  gem.group = skill.group || SHARED_GROUP
  gem.join = skill.join === undefined ? true : skill.join
  gem.supports = (skill.supports || []).map(s => findGem(s, gems, clazz)).filter(e => !!e)
  return gem
}

function groupSkills (skills, groups, parent, parentSkills) {
  groups = groups || {}

  if (!skills) {
    return groups
  }

  for (const skill of skills) {
    const groupLevel = skill.level

    if (!(groupLevel in groups)) {
      groups[groupLevel] = []
    }

    const entry = {
      name: skill.name,
      color: skill.color,
      reward: skill.reward,
      group: parent ? parent.group : skill.group,
      join: parent ? parent.join : skill.join,
      parent: parent && parent.name,
      order: parent ? parentSkills.indexOf(parent) + skills.indexOf(skill) : skills.indexOf(skill)
    }

    groups[groupLevel].push(entry)
    groupSkills(skill.supports, groups, skill, skills)
  }

  return groups
}

function groupGroups (groups) {
  const groupedGroups = {}

  for (const [level, group] of Object.entries(groups)) {
    if (!(level in groupedGroups)) {
      groupedGroups[level] = {}
    }

    for (const groupEntry of group) {
      if (!(groupEntry.group in groupedGroups[level])) {
        groupedGroups[level][groupEntry.group] = []
      }

      groupedGroups[level][groupEntry.group].push({
        ...groupEntry
      })
    }

    for (const [level2, group2] of Object.entries(groups)) {
      if (parseInt(level) <= parseInt(level2)) {
        continue
      }

      for (const groupEntry2 of group2) {
        if (!(groupEntry2.group in groupedGroups[level])) {
          groupedGroups[level][groupEntry2.group] = []
        }

        const currentGroupEntry = groupedGroups[level][groupEntry2.group]
        const existing = currentGroupEntry.find(e => e.name === groupEntry2.name && e.parent === groupEntry2.parent)

        if (!existing) {
          currentGroupEntry.push({
            ...groupEntry2
          })
        }
      }
    }
  }

  const foundGroups = new Set()

  for (const [level, group] of Object.entries(groupedGroups)) {
    for (const groupGroup of Object.values(group)) {
      groupGroup.sort((a, b) => a.order - b.order)
      groupGroup.sort((a, b) => a.parent && b.parent ? a.parent.localeCompare(b.parent) : a.parent ? 1 : b.parent ? -1 : 0)

      let toDelete = []
      for (const groupEntry of groupGroup) {
        if (groupEntry.parent && (!groupGroup.find(e => e.name === groupEntry.parent) || toDelete.find(e => e.name === groupEntry.parent))) {
          toDelete.push(groupEntry)
        }

        if (!groupEntry.join && !groupEntry.parent) {
          toDelete = toDelete.concat(groupGroup.filter(e => !e.parent && e !== groupEntry && e.order < groupEntry.order))
        }
      }

      for (const groupEntry of toDelete) {
        groupGroup.splice(groupGroup.indexOf(groupEntry), 1)
      }
    }

    for (const [level2, group2] of Object.entries(groupedGroups).reverse()) {
      if (parseInt(level) <= parseInt(level2)) {
        continue
      }

      let found = false

      for (const [groupGroup2Name, groupGroup2] of Object.entries(group2)) {
        const groupGroup = group[groupGroup2Name]
        const diff = differenceWith((a, b) => a.name === b.name, groupGroup, groupGroup2)
        diff.forEach(e => {
          e.changed = true
        })
        found = true

        if (!foundGroups.has(groupGroup2Name)) {
          groupGroup2.forEach(e => {
            e.changed = true
          })
        }

        foundGroups.add(groupGroup2Name)
      }

      if (found) {
        break
      }
    }
  }

  return groupedGroups
}

function writeOutput (groups, writer, formatter) {
  writer(HEADER)
  writer('')

  for (const [level, group] of Object.entries(groups)) {
    const anyChanged = Object.values(group).flat().find(s => s.changed)

    if (!anyChanged) {
      continue
    }

    writer('')
    writer(formatter.bold(`Level ${level}`))

    for (const [groupName, skillGroup] of Object.entries(group)) {
      const formattedSkills = uniqBy(prop('name'), skillGroup).slice(0, MAX_LINK).map(s => {
        let output = ''

        if (s.changed) {
          output = formatter.italic(s.name)
        } else {
          output = s.name
        }

        output = formatter.color(output, s.color)

        if (s.changed && s.reward.act) {
          output += ` (Act ${s.reward.act} - ${s.reward.quest}`
          if (s.reward.npc) output += ` - ${s.reward.npc}`
          output += ')'
        }

        return output
      })

      if (formattedSkills.length === 0) {
        continue
      }

      if (parseInt(groupName) === SHARED_GROUP || !skillGroup.find(s => s.parent)) {
        const prefix = formatter.underline('1 link')
        formattedSkills.forEach(s => writer(`${prefix} - ${s}`))
      } else {
        const prefix = formatter.underline(`${formattedSkills.length} link`)
        const join = formattedSkills.join(
          formatter.newline +
          formatter.space.repeat(3) +
          ' '
        )

        writer(`${prefix} - ${join}`)
      }
    }
  }
}

function serveOutput (loader) {
  const format = {
    underline: (i) => `<u>${i}</u>`,
    bold: (i) => `<b>${i}</b>`,
    italic: (i) => `<i>${i}</i>`,
    color: (i, c) => `<span style="color:${c}">${i}</span>`,
    newline: '<br/>\n',
    space: ' '
  }

  const server = http.createServer((req, res) => {
    let body = ''
    writeOutput(loader(), (str) => {
      body += str + format.newline
    }, format)

    const html = `
    <html>
      <head>
        <meta charset='utf-8'>
        <title>Gem progression</title>
      </head>
      <body style="background-color: #1E1F1C; padding: 50px; color: #A38D6D; font-family: Verdana, Arial, Helvetica, sans-serif; font-size: 13px">
        <h2>Gem progression</h2>
        <div style="max-width: 600px">
          ${body}
        </div>
      </body>
    </html>`

    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  })

  server
    .listen(process.env.PORT || 3000, () => console.log('Listening on', server.address()))
    .on('error', (e) => console.error('Encountered error', e))
}

function printOutput (loader) {
  const format = {
    underline: (i) => `[u]${i}[/u]`,
    bold: (i) => `[b]${i}[/b]`,
    italic: (i) => `[i]${i}[/i]`,
    color: (i, c) => `[span color="${c}"]${i}[/span]`,
    newline: '\n',
    space: ' '
  }

  writeOutput(loader(), console.log, format)
}

function run () {
  const parser = new ArgumentParser()
  parser.add_argument('-s', '--serve', { action: 'store_true', help: 'renders the output and serves it as HTML site', default: false })
  parser.add_argument('-c', '--config', { help: 'config file to use for generation' })
  const args = parser.parse_args()

  function dataLoader () {
    const gems = buildGemData()
    const data = loadYaml(args.config)
    const skills = data.skills.map(s => createSkill(s, gems, data.class)).filter(e => !!e)
    const groups = groupSkills(skills)
    return groupGroups(groups)
  }

  if (args.serve) {
    serveOutput(dataLoader)
  } else {
    printOutput(dataLoader)
  }
}

run()
