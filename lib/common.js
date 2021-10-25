const fs = require('fs')
const YAML = require('yaml')
const luaJSON = require('lua-json')

function loadLua (input) {
  const file = fs.readFileSync(input, 'utf-8')
  return luaJSON.parse(file)
}

function loadJson (input) {
  const file = fs.readFileSync(input, 'utf-8')
  return JSON.parse(file)
}

function loadYaml (input) {
  const file = fs.readFileSync(input, 'utf-8')
  return YAML.parse(file)
}

function getData (data) {
  if (data.endsWith('.json')) {
    return loadJson(`data/${data}`)
  }

  if (data.endsWith('.lua')) {
    return loadLua(`data/${data}`)
  }

  if (data.endsWith('.yml')) {
    return loadYaml(`data/${data}`)
  }

  return null
}

module.exports = {
  loadJson,
  loadYaml,
  getData
}
