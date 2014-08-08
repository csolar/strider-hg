var path = require('path')
  , fs = require('fs-extra')
  , spawn = require('child_process').spawn

  , utils = require('./lib')

function safespawn() {
  var c
  try {
    c = spawn.apply(null, arguments)
  } catch (e) {
    throw new Error('Failed to start command: ' + JSON.stringify([].slice.call(arguments)))
  }
  c.on('error', function (err) {
    // suppress node errors
  })
  return c
}


function httpCloneCmd(config, branch) {
  var urls = utils.httpUrl(config)
    , screen = 'hg clone ' + urls[1] + ' .'
    , args = ['clone', urls[0], '.']
  if (branch) {
    args = args.concat(['-b', branch])
    screen += ' -b ' + branch
  }
  return {
    command: 'hg',
    args: args,
    screen: screen
  }
}

function pull(dest, config, context, done) {
  context.cmd({
    cmd: 'hg revert --all',
    cwd: dest
  }, function (exitCode) {
    utils.hgCmd('hg pull', dest, config.auth, context, done)
  })
}

function hgVersion(next) {
  var child = safespawn('hg', ['--version'])
    , out = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', function (data) {
    out += data
  })
  child.stderr.on('data', function (data) {
    out += data
  })
  child.on('close', function (code) {
    if (code) return next(new Error('Failed to get hg version: ' + out))
    next(null, out)
  })
  child.on('error', function () {})
}

function clone(dest, config, ref, context, done) {
  var hg_version = parseFloat('1.0');
  hgVersion(function(err,result){
    var versionArray = result.split(" ");
    if(versionArray[0] == 'Mercurial' && 'version' == versionArray[3].replace('(', ''))
      hg_version = parseFloat(versionArray[4].replace(')', ''));
    console.info("Mercurial Version:"+hg_version);
  });

  if (config.auth.type === 'ssh') {
    var cmd = 'hg clone ' + utils.sshUrl(config)[0] + ' .'
    if (ref.branch) {
      cmd += ' -b ' + ref.branch
    }
    return utils.gitaneCmd(cmd, dest, config.auth.privkey, context, done)
  }
  context.cmd({
    cmd: httpCloneCmd(config),
    cwd: dest
  }, done)}
