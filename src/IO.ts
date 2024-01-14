type Effect<T, Effects> = (effects: Effects) => T

export class IO<A, Effects>{
    private effect: Effect<A, Effects>
    constructor(effect: Effect<A, Effects>){
        this.effect = effect
    }
    static of<T, Effects>(effect: Effect<T, Effects>){
        return new IO(effect)
    }
    map<B>(f: (val: A) => B): IO<B, Effects>{
        return IO.of((effects) => f(this.effect(effects)))
    }
    flatMap<B>(f: (val: A) => IO<B, Effects>): IO<B, Effects>{
        return IO.of((effects) => f(this.effect(effects)).effect(effects))
    }
    eval(effects: Effects){
        return this.effect(effects)
    }
}

export const _do = (fn: (...args: any[]) => Generator<any>) => (...args) => {
    const gen = fn(...args)

    const next = (val?) => {
        const res = gen.next(val)
        if(!res.done) return res.value.flatMap(next)
        if(res.value && res.value.flatMap) return res.value
        return IO.of(() => res.value)
    }

    return next()
}