import fs from 'fs'
import * as cheerio from 'cheerio'
import fetch from 'node-fetch'

async function getRewards(url) {
  const response = await fetch(url)
  const text = await response.text()
  const parsed = cheerio.load(text)
  let rewards = parsed('pre').html()
  rewards = rewards.replace('return data', '')
  rewards = rewards.replace('local data = ', 'return ')
  return rewards
}

async function run() {
  console.info('Getting quest rewards...')
  const questRewards = await getRewards('https://www.poewiki.net/wiki/Module:Quest_reward/data/quest_rewards')
  fs.writeFileSync('data/quest-rewards.lua', questRewards, { encoding:'utf8',flag:'w' })

  console.info('Getting vendor rewards...')
  const vendorRewards = await getRewards('https://www.poewiki.net/wiki/Module:Quest_reward/data/vendor_rewards')
  fs.writeFileSync('data/vendor-rewards.lua', vendorRewards, { encoding:'utf8',flag:'w' })

  console.info('Getting gems data...')
  const gemsReponse = await fetch('https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/gems.json')
  const gems = await gemsReponse.text()
  fs.writeFileSync('data/gems.json', gems, { encoding:'utf8',flag:'w' })

  console.info('Finished')
}

run()