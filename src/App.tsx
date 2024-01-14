import React from 'react'
import {museState, museEffect, museCallback, museComponent, museWait, makeComponent} from './makeComponent'

type Props = {
    yo: string
}

function* Component(props: Props){
    const [clicked, setClicked] = yield museState('done', false)

    yield museEffect('start', () => {
        console.log('mounted')
    }, [clicked])

    const onClick = yield museCallback('click', () => setClicked(true), [])

    yield museComponent('before', () =>
        <div>Waiting...</div>
    )

    const result = yield museWait('delay', async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        return 5
    }, [])

    return museComponent('main', () =>
        <div onClick={onClick}>
            isDone {clicked.toString()}
            {Object.values(props).join(',')}
            {result}
        </div>
    )
}

export const App = makeComponent<Props>(Component)