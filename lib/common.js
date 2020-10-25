const fs = require('fs')
const YAML = require('yaml')

function loadJson (input) {
  const file = fs.readFileSync(input, 'utf-8')
  return JSON.parse(file)
}

function loadYaml (input) {
  const file = fs.readFileSync(input, 'utf-8')
  return YAML.parse(file)
}

function getData (data) {
  return loadJson(`data/${data}.json`)
}

module.exports = {
  loadJson,
  loadYaml,
  getData
}
