/*
 *  Copyright 2014 TWO SIGMA OPEN SOURCE, LLC
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
/**
 * Module bk.core
 * Holds the core of beaker utilities. It wraps of lower level utilities that come from other
 * modules.
 * The user facing directives also use the core as a communication/exchange layer.
 */
(function() {
  'use strict';
  angular.module('bk.core').factory('autocompleteService', function(codeMirrorExtension, bkEvaluatorManager) {

  var showAutocomplete = function(cm, scope) {
    var getToken = function(editor, cur) {
      return editor.getTokenAt(cur);
    };
    var getHints = function(editor, showHintCB, options) {
      var cur = editor.getCursor();
      var token = getToken(editor, cur);
      var cursorPos = editor.indexFromPos(cur);

      var waitfor = [];
      for(var i in codeMirrorExtension.autocomplete) {
        var t = codeMirrorExtension.autocomplete[i];
        if (t.type === token.type || t.type === '*') {
          waitfor.push(t.hint(token, editor));
        }
      }

      var onResults = function(results, matched_text, dotFix) {
        var start = token.start;
        var end = token.end;
        if (dotFix && token.string === ".") {
          start += 1;
        }
        if (matched_text) {
          start += (cur.ch - token.start - matched_text.length);
          end = start + matched_text.length;
        }
        var hintData = {
          from: CodeMirror.Pos(cur.line, start),
          to: CodeMirror.Pos(cur.line, end),
          list: _.uniq(results)
        };

        var evaluator = bkEvaluatorManager.getEvaluator(scope.cellmodel.evaluator);
        if (_.isFunction(evaluator.showDocs)) {
          attachAutocompleteListeners(hintData, evaluator, scope, cm);
        }

        if (waitfor.length > 0) {
          $q.all(waitfor).then(function (res) {
            for (var i in res) {
              hintData.results = _.uniq(results.concat(res[i]));
            }
            showHintCB(hintData);
          }, function(err) {
            showHintCB(hintData);
          })
        } else {
          showHintCB(hintData);
        }
      };
      scope.autocomplete(cursorPos, onResults);
    };

    if (cm.getOption('mode') === 'htmlmixed' || cm.getOption('mode') === 'javascript') {
      cm.execCommand("autocomplete");
    } else {
      var options = {
        async: true,
        closeOnUnfocus: true,
        alignWithWord: true,
        completeSingle: true
      };
      CodeMirror.showHint(cm, getHints, options);
    }
  };

  var maybeShowAutocomplete = function(cm, scope) {
    if (scope.bkNotebook.getCMKeyMapMode() === "emacs") {
      cm.setCursor(cm.getCursor());
      cm.setExtending(!cm.getExtending());
      cm.on("change", function() {
        cm.setExtending(false);
      });
    } else {
      showAutocomplete(cm, scope);
    }
  };
  var attachAutocompleteListeners = function(hintData, evaluator, scope, cm) {
    CodeMirror.on(hintData, 'select', function(a1, a2) {
      evaluator.showDocs(a1, a1.length - 1, function(documentation) {
        scope.$broadcast('showDocumentationForAutocomplete', documentation, true);
      });
    });
    CodeMirror.on(cm, 'endCompletion', function() {
      scope.$broadcast('hideDocumentationForAutocomplete');
    });
  };

  return {
    showAutocomplete: showAutocomplete,
    maybeShowAutocomplete: maybeShowAutocomplete
  };

  });
})();
