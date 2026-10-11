"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import {getPurchaseSaveStatus} from '@/app/actions/purchases'

/** Only an operation UUID is persisted, never form data, credentials or tokens. */
export function usePurchaseOperation(key:string,onSaved:(id:string)=>void) {
 const [phase,setPhase]=useState<'loading'|'ready'|'saving'|'uncertain'|'done'>('loading')
 const [message,setMessage]=useState('')
 const id=useRef<string|null>(null),locked=useRef(true),saved=useRef(onSaved)
 useEffect(()=>{saved.current=onSaved},[onSaved])
 const complete=useCallback((purchaseId:string)=>{
  locked.current=true;setPhase('done')
  try{sessionStorage.removeItem(key)}catch{/* navigation remains locked */}
  saved.current(purchaseId)
 },[key])
 const check=useCallback(async()=>{
  if(!id.current)return
  locked.current=true;setPhase('loading')
  let r:Awaited<ReturnType<typeof getPurchaseSaveStatus>>
  try{r=await getPurchaseSaveStatus(id.current)}catch{r={status:'unknown'}}
  if(r.status==='committed'&&r.id){complete(r.id);return}
  if(r.status==='absent'){
   locked.current=false;setPhase('ready');setMessage('Сохранённая отправка не найдена. Можно повторить сохранение с прежним номером операции.')
  }else{setPhase('uncertain');setMessage('Результат отправки пока не подтверждён. Проверьте его ещё раз перед сохранением.')}
 },[complete])
 useEffect(()=>{
  let cancelled=false
  queueMicrotask(()=>{
  if(cancelled)return
  try{id.current=sessionStorage.getItem(key)}catch{setPhase('uncertain');setMessage('Для безопасного сохранения требуется хранилище вкладки.');return}
  if(id.current){void check()}else{locked.current=false;setPhase('ready')}
  })
  return ()=>{cancelled=true}
 },[key,check])
 const begin=()=>{
  if(locked.current)return null
  try{
   id.current??=crypto.randomUUID();sessionStorage.setItem(key,id.current)
  }catch{locked.current=true;setPhase('uncertain');setMessage('Не удалось сохранить номер отправки. Закупка не отправлена.');return null}
  locked.current=true;setPhase('saving');setMessage('');return id.current
 }
 const failed=(uncertain=false)=>{
  locked.current=uncertain;setPhase(uncertain?'uncertain':'ready')
  if(uncertain)setMessage('Ответ потерян. Проверьте результат отправки; новая закупка автоматически не создаётся.')
 }
 return {begin,failed,complete,check,message,uncertain:phase==='uncertain',disabled:phase!=='ready'}
}
