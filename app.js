(function() {
  var window = this;
  var $ = window.jQuery;
  var rand = function rand(n) {
    return Math.floor(Math.random() * n);
  };

  var Arithmetic = {
    init: function init(options) {
      this.options = options;
      var game = $('#game');
      this.d_left = game.find('.left');
      this.correct = game.find('.correct');
      this.banner = game.find('.banner');
      this.problem = game.find('.problem');
      this.answer = game.find('.answer');
      console.log('this.answer in init:', this.answer);
      if (this.answer.length === 0) {
        console.error('Error: .answer element not found in DOM');
      }
      this.answer.focus();

      if (options.room) {
        this.startMultiplayer();
      } else {
        this.startSinglePlayer();
      }
    },

    startSinglePlayer: function() {
      var problem_start_time = Date.now();
      var start_time = Date.now();
      var correct_ct = 0;
      var correct_info = [];
      var duration = this.options.duration || 120;
      var that = this;

      var randGen = function randGen(min, max) {
        return function() {
          return min + rand(max - min + 1);
        };
      };

      var genTypes = ['add_left', 'add_right', 'mul_left', 'mul_right'];
      var randGens = {};
      genTypes.forEach(function(type) {
        randGens[type] = randGen(
          that.options[type + '_min'],
          that.options[type + '_max']
        );
      });

      var pg_add = function pg_add() {
        var left = randGens[genTypes[0]]();
        var right = randGens[genTypes[1]]();
        return [left + ' + ' + right, left + right];
      };
      var pg_sub = function pg_sub() {
        var left = randGens[genTypes[0]]();
        var right = randGens[genTypes[1]]();
        return [left + right + ' – ' + left, right];
      };
      var pg_mul = function pg_mul() {
        var left = randGens[genTypes[2]]();
        var right = randGens[genTypes[3]]();
        return [left + ' × ' + right, left * right];
      };
      var pg_div = function pg_div() {
        var left = randGens[genTypes[2]]();
        var right = randGens[genTypes[3]]();
        if (left !== 0) {
          return [left * right + ' ÷ ' + left, right];
        }
      };

      var pgs = [];
      if (this.options.add) pgs.push(pg_add);
      if (this.options.sub) pgs.push(pg_sub);
      if (this.options.mul) pgs.push(pg_mul);
      if (this.options.div) pgs.push(pg_div);

      var problemGen = function problemGen() {
        var genned = void 0;
        while (genned == null) {
          genned = pgs[rand(pgs.length)]();
        }
        return genned;
      };

      var genned = null;
      var problemGeng = function problemGeng() {
        genned = problemGen();
        that.problem.text(genned[0]);
        that.answer.val('');
      };

      var cb = function cb(e) {
        var str_ans = '' + genned[1];
        if ($.trim($(this).val()) === str_ans) {
          var now = Date.now();
          correct_info.push([genned[0], genned[1], Math.floor(now - problem_start_time)]);
          problem_start_time = now;
          problemGeng();
          that.correct.text('Score: ' + ++correct_ct);
        }
        return true;
      };
      this.answer.keydown(cb).keyup(cb);

      problemGeng();
      this.d_left.text('Seconds left: ' + duration);

      var timer = setInterval(function() {
        var d = duration - Math.floor((Date.now() - start_time) / 1000);
        that.d_left.text('Seconds left: ' + d);
        if (d <= 0) {
          clearInterval(timer);
          that.answer.prop('disabled', true);
          that.banner.find('.start').hide();
          that.banner.find('.end').show();
          that.correct.text('Score: ' + correct_ct);
        }
      }, 1000);
    },

    startMultiplayer: function() {
      console.log('Starting multiplayer, this.answer:', this.answer);
      this.d_left.text('Seconds left: ' + (this.options.duration || 120));
      this.correct.text('Score: 0');
      // Banner stays hidden until countdown finishes (handled in index.html)
      var that = this;
      this.answer.bind('keypress', function(e) {
        if (e.which === 13) {
          var answer = $.trim($(this).val());
          window.socket.emit('submitAnswer', {
            roomId: that.options.room,
            answer: parseInt(answer)
          });
          $(this).val('');
        }
      });
    },

    updateProblem: function(problemText) {
      this.problem.text(problemText);
      this.answer.val('');
    },

    updateScore: function(score) {
      this.correct.text('Score: ' + score);
    },

    endGame: function(finalScore) {
      this.answer.prop('disabled', true);
      this.banner.find('.start').hide();
      this.banner.find('.end').show();
      this.correct.text('Score: ' + finalScore); // Use existing span, no "Final Score" prefix
    }
  };

  window.Arithmetic = Arithmetic;
}).call(this);