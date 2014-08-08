var mercurial = require('./mercurial')
  , exec = require('child_process').exec
  , shellescape = require('shell-escape')

module.exports = {
  hgUrl: hgUrl,
  sshUrl: sshUrl,
  httpsUrl: httpsUrl,
  hgCmd: hgCmd,
  mercurialCmd: mercurialCmd,
  processBranches: processBranches,
  getBranches: getBranches,
  shellEscape: shellEscape
}

function shellEscape(one) {
  if (!one) {
    throw new Error('trying to escape nothing', one)
  }
  return shellescape([one])
}

// returns [real, safe] urls
function hgUrl(config) {
  return (config.auth.type === 'ssh' ? sshUrl : httpsUrl)(config)
}

function sshUrl(config) {
  var base = config.url
 
  if (base.indexOf('//') !== -1) {
    base = base.split('//')[1]
  }
  if (base.indexOf('@') === -1) {
    base = 'hg@' + base
  }
  base = 'ssh://' + base.replace('.com', '.org');
 
  var url = base;//shellEscape(base)
  return [url, url]
}

function httpsUrl(config) {
  var base = config.url
  if (base.indexOf('//') !== -1) {
    base = base.split('//')[1]
  }
  var url = config.auth.type + '://' + config.auth.username + ':' + config.auth.password + '@' + base
    , safe = config.auth.type + '://[username]:[password]@' + base
  return [url, safe]
}

function hgCmd(cmd, cwd, auth, context, done) {
  if (auth.type === 'ssh') {
    return mercurialCmd(cmd, cwd, auth.privkey, context, done)
  }
  context.cmd({
    cmd: cmd,
    cwd: cwd
  }, done)
}

// run a strider command with ?
function mercurialCmd(cmd, dest, privkey, context, done) {
  var start = new Date()
  context.status('command.start', { command: cmd, time: start, plugin: context.plugin })
  mercurial.run({
    emitter: {
      emit: context.status
    },
    cmd: cmd,
    baseDir: dest,
    privKey: privkey,
    detached: true
  }, function (err, stdout, stderr, exitCode) {
    var end = new Date()
      , elapsed = end.getTime() - start.getTime()
    if (err) {
      context.log('Mercurial error:', err.message)
    }
    context.log('mercurial command done %s; exit code %s; duration %s', cmd, exitCode, elapsed)
    context.status('command.done', {exitCode: exitCode, time: end, elapsed: elapsed})
    done(err ? 500 : exitCode, stdout + stderr)
  })
}

function processBranches(data, done) {
  done(null, data.trim().split(/\n+/).map(function (line) {
    return line.split(/\s+/)[1].split('/').slice(-1)[0]
  }))
}

function getBranches(config, privkey, done) {
  mercurial.run({
    cmd: 'hg branches',
    baseDir: '/',
    privKey: config.auth.privkey || privkey,
    detached: true
  }, function (err, stdout, stderr, exitCode) {
    if (err || exitCode !== 0) return done(err || new Error(stderr))
    processBranches(stdout, done)
  });
}

