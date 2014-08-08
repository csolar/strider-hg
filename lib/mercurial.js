var crypto = require('crypto')
var EventEmitter = require('events').EventEmitter
var fs = require('fs')
var path = require('path')
var os = require('os')
var spawn = require('child_process').spawn
var Step = require('step');

// mercurial wrapper spawned from https://github.com/niallo/Gitane git wrapper


var PATH = process.env.PATH

var emitter

// Template string for wrapper script.
var HG_SSH_TEMPLATE = '#!/bin/sh\n' +
'exec ssh -i $key -o StrictHostKeyChecking=no "$@"\n'

function mkTempFile(prefix, suffix) {
    var randomStr = crypto.randomBytes(4).toString('hex')
    var name = prefix + randomStr + suffix
    var file = path.join(os.tmpDir(), name)
    // Hack for weird environments (nodejitsu didn't guarantee os.tmpDir() to already exist)
    try {
        fs.mkdirSync(os.tmpDir())
    } catch (e) {}

    return file
}

//
// Write the Mercurial script template to enable use of the SSH private key
//
// *privKey* SSH private key.
// *file* (optional) filename of script.
// *keyMode* (optional) mode of key.
// *cb* callback function of signature function(err, tempateFile, keyFile).
//
function writeFiles(privKey, file, keyMode, cb) {
  // No file name - generate a random one under the system temp dir
  if (!file) {
    file = mkTempFile("_mercurial", ".sh")
  }

  if (typeof(keyMode) === 'function') {
    cb = keyMode
    keyMode = 0600
  }

  var keyfile = mkTempFile("_mercurialid", ".key")

  var data = HG_SSH_TEMPLATE.replace('$key', keyfile)
  Step(
    function() {
      fs.writeFile(file, data, this.parallel())
      fs.writeFile(keyfile, privKey, this.parallel())
    },
    function(err) {
      if (err) {
        return cb(err, null)
      }
      // make script executable
      fs.chmod(file, 0755, this.parallel())
      // make key secret
      fs.chmod(keyfile, keyMode, this.parallel())
    },
    function(err) {
      if (err) {
        return cb(err, null)
      }

      return cb(null, file, keyfile)
    }
  )
}

//
// Run a command in a subprocess with HG_SSH set to the correct value for
// SSH key.
//
// *baseDir* current working dir from which to execute git
// *privKey* SSH private key to use
// *cmd* command to run
// *keyMode* optional unix file mode of key
// *cb* callback function of signature function(err, stdout, stderr)
//
// or first argument may be an object with params same as above,
// with addition of *emitter* which is an EventEmitter for real-time stdout
// and stderr events. An optional *detached* option specifies whether the 
// spawned process should be detached from this one, and defaults to true.
// Detachment means the git process won't hang trying to prompt for a password.
function run(baseDir, privKey, cmd, keyMode, cb) {
  var detached = true
  if (typeof(keyMode) === 'function') {
    cb = keyMode
    keyMode = 0600
  }

  if (typeof(baseDir) === 'object') {
    var opts = baseDir
    cb = privKey
    cmd = opts.cmd
    privKey = opts.privKey
    keyMode = opts.keyMode || 0600
    emitter = opts.emitter
    baseDir = opts.baseDir
    if (typeof(opts.detached) !== 'undefined') {
      detached = opts.detached
    }
  }

  var split = cmd.split(/\s+/)
  var cmd = split[0]
  var args = split.slice(1)

  Step(
    function() {
      writeFiles(privKey, null, keyMode, this)
    },
    function(err, file, keyfile) {
      if (err) {
        console.log("Error writing files: %s", err)
        return cb(err, null)
      }
      this.file = file
      this.keyfile = keyfile
      var proc = spawn(cmd, args, {cwd: baseDir, env: {HG_SSH: file, PATH:PATH}, detached: detached})
      proc.stdoutBuffer = ""
      proc.stderrBuffer = ""
      proc.stdout.setEncoding('utf8')
      proc.stderr.setEncoding('utf8')

      proc.stdout.on('data', function(buf) {
        if (typeof(emitter) === 'object') {
          emitter.emit('stdout', buf)
        }
        proc.stdoutBuffer += buf
      })

      proc.stderr.on('data', function(buf) {
        if (typeof(emitter) === 'object') {
          emitter.emit('stderr', buf)
        }
        proc.stderrBuffer += buf
      })

      var self = this
      proc.on('close', function(exitCode) {
        var err = null
        if (exitCode !== 0) {
          err = "process exited with status " + exitCode
        }
        self(err, proc.stdoutBuffer, proc.stderrBuffer, exitCode)
      })
      proc.on('error', function (err) {
        // prevent node from throwing an error. The error handling is
        // done in the 'close' handler.
      })
    },
    function(err, stdout, stderr, exitCode) {
      // cleanup temp files
      try {
        fs.unlink(this.file)
        fs.unlink(this.keyfile)
      } catch(e) {}

      cb(err, stdout, stderr, exitCode)
    }
  )
}

function addPath(str) {
  PATH = PATH + ":" + str
}

module.exports = {
  run:run,
  writeFiles:writeFiles,
  addPath:addPath,
}
