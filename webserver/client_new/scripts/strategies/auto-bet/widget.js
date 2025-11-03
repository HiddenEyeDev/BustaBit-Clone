define([
  'react',
  'lib/react-radio'
], function (React, ReactRadioClass) {
  const ReactRadio = React.createFactory(ReactRadioClass);
  const D = React.DOM;

  return React.createClass({
    displayName: 'AutoBetWidget',

    propTypes: {
      StrategyEditorStore: React.PropTypes.object.isRequired,
      StrategyEditorActions: React.PropTypes.object.isRequired
    },

    getState: function () {
      const state = this.props.StrategyEditorStore.getWidgetState();
      state.active = this.props.StrategyEditorStore.getEditorState();
      return state;
    },

    getInitialState: function () {
      return this.getState();
    },

    componentDidMount: function () {
      this.props.StrategyEditorStore.addWidgetChangeListener(this._onChange);
    },

    componentWillUnmount: function () {
      this.props.StrategyEditorStore.removeWidgetChangeListener(this._onChange);
    },

    _onChange: function () {
      this.setState(this.getState());
    },

    updateOnLoss: function (opt) {
      this.props.StrategyEditorActions.setWidgetState('onLossSelectedOpt', opt);
    },

    updateOnWin: function (opt) {
      this.props.StrategyEditorActions.setWidgetState('onWinSelectedOpt', opt);
    },

    updateBetAmount: function () {
      const amount = this.refs.bet_amount.getDOMNode().value;
      this.props.StrategyEditorActions.setWidgetState('baseBet', amount);
    },

    updateAutoCashAt: function () {
      const amount = this.refs.auto_cash_at.getDOMNode().value;
      this.props.StrategyEditorActions.setWidgetState('autoCashAt', amount);
    },

    updateOnLossQty: function () {
      const amount = this.refs.onLossQty.getDOMNode().value;
      this.props.StrategyEditorActions.setWidgetState('onLossIncreaseQty', amount);
    },

    updateOnWinQty: function () {
      const amount = this.refs.onWinQty.getDOMNode().value;
      this.props.StrategyEditorActions.setWidgetState('onWinIncreaseQty', amount);
    },

    updateMaxBetStop: function () {
      const amount = this.refs.max_bet_stop.getDOMNode().value;
      this.props.StrategyEditorActions.setWidgetState('maxBetStop', amount);
    },

    render: function () {
      const inputClass =
        // ✅ More visible input styling
        'w-24 px-2 py-1 bg-slate-800/70 border border-slate-700 ' +
        'text-slate-50 placeholder-slate-400 ' +
        'focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 ' +
        'outline-none rounded-md transition-all text-sm ' +
        'disabled:opacity-70 disabled:cursor-not-allowed disabled:text-slate-400 ' +
        'disabled:bg-slate-700/60';

      const containerClass =
        'flex flex-col gap-3 p-4 bg-slate-900/60 border border-slate-800 ' +
        'text-slate-300 text-sm rounded-md shadow-inner';

      const labelClass =
        'font-medium text-slate-200 mr-2 w-36 inline-block text-right select-none';
      const radioGroupClass = 'flex flex-col gap-1 pl-2';

      return D.div({ className: containerClass },

        // Base Bet
        D.div({ className: 'flex items-center justify-start gap-2' },
          D.span({ className: labelClass }, 'Base Bet:'),
          D.input({
            type: 'text',
            ref: 'bet_amount',
            className: inputClass,
            onChange: this.updateBetAmount,
            value: this.state.baseBet,
            disabled: this.state.active,
            placeholder: 'Enter bet...'
          }),
          D.span({ className: 'text-slate-500 text-xs' }, 'bits')
        ),

        // Auto Cashout
        D.div({ className: 'flex items-center justify-start gap-2' },
          D.span({ className: labelClass }, 'Auto Cashout:'),
          D.input({
            type: 'text',
            ref: 'auto_cash_at',
            className: inputClass,
            onChange: this.updateAutoCashAt,
            value: this.state.autoCashAt,
            disabled: this.state.active,
            placeholder: 'e.g. 2.00'
          }),
          D.span({ className: 'text-slate-500 text-xs' }, 'x')
        ),

        // Max Bet Stop
        D.div({ className: 'flex items-center justify-start gap-2 border-b border-slate-800 pb-3 mb-3' },
          D.span({ className: labelClass }, 'Stop if bet >'),
          D.input({
            type: 'text',
            ref: 'max_bet_stop',
            className: inputClass,
            onChange: this.updateMaxBetStop,
            value: this.state.maxBetStop,
            disabled: this.state.active,
            placeholder: 'Max limit'
          }),
          D.span({ className: 'text-slate-500 text-xs' }, 'bits')
        ),

        // On Loss
        D.div({ className: 'flex items-start gap-2' },
          D.span({ className: labelClass }, 'On Loss:'),
          ReactRadio(
            {
              name: 'onLoss',
              onChange: this.updateOnLoss,
              defaultValue: this.state.onLossSelectedOpt
            },
            D.div({ className: radioGroupClass },
              D.label({ className: 'flex items-center gap-2 cursor-pointer' },
                D.input({
                  type: 'radio',
                  value: 'return_to_base',
                  className: 'accent-cyan-500',
                  disabled: this.state.active
                }),
                D.span(null, 'Return to base bet')
              ),
              D.label({ className: 'flex items-center gap-2 cursor-pointer' },
                D.input({
                  type: 'radio',
                  value: 'increase_bet_by',
                  className: 'accent-cyan-500',
                  disabled: this.state.active
                }),
                D.span(null, 'Increase bet by:'),
                D.input({
                  type: 'text',
                  ref: 'onLossQty',
                  className: inputClass + ' w-16',
                  onChange: this.updateOnLossQty,
                  value: this.state.onLossIncreaseQty,
                  disabled:
                    this.state.active ||
                    this.state.onLossSelectedOpt !== 'increase_bet_by',
                  placeholder: '1.2'
                }),
                D.span({ className: 'text-slate-500 text-xs' }, 'x')
              )
            )
          )
        ),

        // On Win
        D.div({ className: 'flex items-start gap-2 mt-2' },
          D.span({ className: labelClass }, 'On Win:'),
          ReactRadio(
            {
              name: 'onWin',
              onChange: this.updateOnWin,
              defaultValue: this.state.onWinSelectedOpt
            },
            D.div({ className: radioGroupClass },
              D.label({ className: 'flex items-center gap-2 cursor-pointer' },
                D.input({
                  type: 'radio',
                  value: 'return_to_base',
                  className: 'accent-cyan-500',
                  disabled: this.state.active
                }),
                D.span(null, 'Return to base bet')
              ),
              D.label({ className: 'flex items-center gap-2 cursor-pointer' },
                D.input({
                  type: 'radio',
                  value: 'increase_bet_by',
                  className: 'accent-cyan-500',
                  disabled: this.state.active
                }),
                D.span(null, 'Increase bet by:'),
                D.input({
                  type: 'text',
                  ref: 'onWinQty',
                  className: inputClass + ' w-16',
                  onChange: this.updateOnWinQty,
                  value: this.state.onWinIncreaseQty,
                  disabled:
                    this.state.active ||
                    this.state.onWinSelectedOpt !== 'increase_bet_by',
                  placeholder: '1.1'
                }),
                D.span({ className: 'text-slate-500 text-xs' }, 'x')
              )
            )
          )
        )
      );
    }
  });
});
