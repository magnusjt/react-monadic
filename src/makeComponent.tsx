import React from 'react'
import { IO, _do } from './IO'

type EffectFunction = () => void
type CallbackFunction = (...args: any[]) => void
type ComponentFunction = () => React.ReactNode
type WaitFunction<T> = () => Promise<T>
type Deps = any[]

type IOEffects = {
    state: (name, initialValue: any) => [any, (any: any) => void]
    effect: (name, fn: EffectFunction, deps: Deps) => void
    wait: <T>(name, fn: WaitFunction<T>, deps: Deps) => T
    callback: <T extends CallbackFunction>(name, fn: T, deps: Deps) => T
    component: (name, fn: ComponentFunction) => void
}

export function museState(name: string, initial){
    return IO.of((eff: IOEffects) => eff.state(name, initial))
}

export function museEffect(name: string, fn: EffectFunction, deps: Deps){
    return IO.of((eff: IOEffects) => eff.effect(name, fn, deps))
}

export function museWait<T>(name, fn: WaitFunction<T>, deps: Deps){
    return IO.of((eff: IOEffects) => eff.wait(name, fn, deps))
}

export function museCallback<T extends CallbackFunction>(name: string, fn: T, deps: Deps){
    return IO.of((eff: IOEffects) => eff.callback(name, fn, deps))
}

export function museComponent(name: string, fn: ComponentFunction){
    return IO.of((eff: IOEffects) => eff.component(name, fn))
}

const depsEqual = (deps1: Deps, deps2: Deps) => {
    if(deps1.length !== deps2.length) return false
    for(let i = 0; i < deps1.length; i++){
        if(deps1[i] !== deps2[i]) return false
    }
    return true
}

const makeMuseStateAction = (component) => {
    return (name, initial): [any, (any: any) => void] => {
        let val
        if(!component.state || !component.state.hasOwnProperty(name)){
            val = initial
        }else{
            val = component.state[name]
        }
        return [val, (v) => component.setState(state => ({...state, [name]: v}))]
    }
}

type EffectsStorage = {
    [key: string]: {
        shouldUpdate: boolean
        fn: () => (() => void) | void
        deps: any[]
        clean: () => void
    }
}

const makeMuseEffectAction = () => {
    const effects: EffectsStorage = {}
    return {
        museEffect: (name, fn, deps) => {
            if(!effects.hasOwnProperty(name)){
                effects[name] = {fn, deps, shouldUpdate: true, clean: () => {}}
            }
            if(!depsEqual(effects[name].deps, deps)){
                effects[name].clean()
                effects[name] = {fn, deps, shouldUpdate: true, clean: () => {}}
            }
        },
        trigger: () => {
            Object.values(effects)
                .forEach(eff => {
                    if(eff.shouldUpdate){
                        eff.shouldUpdate = false
                        const clean = eff.fn()
                        eff.clean = clean || (() => {})
                    }
                })
        },
        clean: () => {
            Object.values(effects)
                .forEach(eff => {
                    if(!eff.shouldUpdate){
                        eff.clean()
                    }
                })
        }
    }
}

const makeMuseCallbackAction = () => {
    const callbacks = {}
    return (name, fn, deps) => {
        if(!callbacks.hasOwnProperty(name) || !depsEqual(deps, callbacks[name].deps)){
            callbacks[name] = {fn, deps}
            return fn
        }

        return callbacks[name].fn
    }
}

const isWaitError = err => err.name === '__waiting'

const makeMuseWaitAction = (forceUpdate) => {
    const waiting = {}

    return (name, fn, deps) => {
        const waitError = () => {
            const err = new Error('Dummy')
            err.name = '__waiting'
            return err
        }

        if(!waiting.hasOwnProperty(name) || !depsEqual(deps, waiting[name].deps)){
            waiting[name] = {fn, deps, waiting: true, value: null, err: null}

            const afterDone = (value) => {
                waiting[name].waiting = false
                waiting[name].value = value
                forceUpdate()
            }
            const afterError = (err) => {
                waiting[name].waiting = false
                waiting[name].err = err
                forceUpdate()
            }
            fn().then(afterDone, afterError)

            throw waitError()
        }

        if(waiting[name].waiting){
            throw waitError()
        }

        if(waiting[name].err){
            throw waiting[name].err
        }

        return waiting[name].value
    }
}

const makeMuseComponentAction = () => {
    let componentFn = () => null
    return {
        action: (name, fn) => {
            componentFn = fn
        },
        component: () => componentFn()
    }
}

export function makeComponent<Props>(generator: (Props) => Generator<any>){
    const program = _do(generator)

    return class extends React.PureComponent<Props>{
        private _actions: IOEffects

        private _component: () => React.ReactNode
        private _museEffectAction: { trigger: () => void; clean: () => void; museEffect: (name, fn, deps) => void }
        private _museComponentAction: { component: () => React.ReactNode; action: (name, fn) => void }

        constructor(props){
            super(props)
            this._component = () => null
            this._museEffectAction = makeMuseEffectAction()
            this._museComponentAction = makeMuseComponentAction()

            this._actions = {
                state: makeMuseStateAction(this),
                effect: this._museEffectAction.museEffect,
                callback: makeMuseCallbackAction(),
                component: this._museComponentAction.action,
                wait: makeMuseWaitAction(this.forceUpdate.bind(this))
            }
        }
        componentDidMount(): void{
            this._museEffectAction.trigger()
        }
        componentDidUpdate(prevProps: Readonly<{}>, prevState: Readonly<{}>, snapshot?: any): void{
            this._museEffectAction.trigger()
        }
        componentWillUnmount(): void{
            this._museEffectAction.clean()
        }
        render(){
            try{
                program(this.props).eval(this._actions)
            }catch(err){
                if(isWaitError(err)){
                    // Do nothing
                }else{
                    throw err
                }
            }

            return this._museComponentAction.component()
        }
    }
}