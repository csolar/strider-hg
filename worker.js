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
    cmd: 'hg pull',
    cwd: dest
  }, function (exitCode) {
    utils.hgCmd('hg up', dest, config.auth, context, done)
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
    var cmd = 'hg clone ' + utils.sshUrl(config)[0] + ' .';
    if (ref.branch) {
      cmd += ' -b ' + ref.branch
    }
    return utils.hgCmd(cmd, dest, config.auth.privkey, context, done)
  }
  context.cmd({
    cmd: httpCloneCmd(config),
    cwd: dest
  }, done)}

function badCode(name, code) {
  var e = new Error(name + ' failed with code ' + code)
  e.code = code
  e.exitCode = code
  return e
}

module.exports = {
  init: function (dirs, config, job, done) {
    return done(null, {
      config: config,
      fetch: function (context, done) {
        module.exports.fetch(dirs.data, config, job, context, done)
      }
    })
  },
  fetch: fetch
}

function getMasterPrivKey(branches) {
  for (var i=0; i<branches.length; i++) {
    if (branches[i].name === 'default') {
      return branches[i].privkey
    }
  }
}

function checkoutRef(dest, cmd, ref, done) {
  return cmd({
    cmd: 'hg revert -q --all -r ' + utils.shellEscape(ref.id || ref.branch),
    cwd: dest
  }, function (exitCode) {
    done(exitCode && badCode('Revert', exitCode))
  })
}

function fetch(dest, config, job, context, done) {
  if (config.auth.type === 'ssh' && !config.auth.privkey) {
    config.auth.privkey = getMasterPrivKey(job.project.branches)
  }
  var get = pull
    , cloning = false
    , pleaseClone = function () {
        cloning = true
        fs.mkdirp(dest, function () {
          clone(dest, config, job.ref, context, updateCache)
        })
      }
  if (!config.cache) return pleaseClone()

  context.cachier.get(dest, function (err) {
    if (err) return pleaseClone()
    // make sure .hg exists
    fs.exists(path.join(dest, '.hg'), function (exists) {
      if (exists) {
        context.comment('restored code from cache')
        return pull(dest, config, context, updateCache)
      }
      fs.remove(dest, function(err) {
        pleaseClone()
      })
    })
  })

  function updateCache(exitCode) {
    if (exitCode) return done(badCode('Mercurial ' + (cloning ? 'clone' : 'pull'), exitCode))
    if (!config.cache) return gotten()
    context.comment('saved code to cache')
    context.cachier.update(dest, gotten)
  }

  function gotten (err) {
    if (err) return done(err)
    // fetch the ref
    if (job.ref.branch && !job.ref.fetch) {
      return checkoutRef(dest, context.cmd, job.ref, done)
    }
    fetchRef(job.ref.fetch, dest, config.auth, context, done)
  }
}

function fetchRef(what, dest, auth, context, done) {
  utils.hgCmd('hg pull ' + utils.shellEscape(what), dest, auth, context, function (exitCode) {
    if (exitCode) return done(badCode('Fetch ' + what, exitCode))
    context.cmd({
      cmd: 'hg revert --all -r tip',
      cwd: dest
    }, function (exitCode) {
      done(exitCode && badCode('Revert', exitCode))
    })
  })
}