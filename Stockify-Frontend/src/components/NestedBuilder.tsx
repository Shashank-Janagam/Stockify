

export const updateNodeInTree = (node: any, path: number[], updater: (n: any) => any): any => {
  if (path.length === 0) return updater(node);
  const [head, ...tail] = path;
  if (!node.conditions) return node;
  const newConditions = [...node.conditions];
  newConditions[head] = updateNodeInTree(newConditions[head], tail, updater);
  return { ...node, conditions: newConditions };
};

export const deleteNodeInTree = (node: any, path: number[]): any => {
  if (path.length === 0) return null;
  const [head, ...tail] = path;
  if (tail.length === 0) {
    const newConditions = [...node.conditions];
    newConditions.splice(head, 1);
    return { ...node, conditions: newConditions };
  }
  const newConditions = [...node.conditions];
  newConditions[head] = deleteNodeInTree(newConditions[head], tail);
  return { ...node, conditions: newConditions };
};

export const addNodeInTree = (node: any, path: number[], newNode: any): any => {
  if (path.length === 0) {
    return { ...node, conditions: [...(node.conditions || []), newNode] };
  }
  const [head, ...tail] = path;
  const newConditions = [...node.conditions];
  newConditions[head] = addNodeInTree(newConditions[head], tail, newNode);
  return { ...node, conditions: newConditions };
};

export const RecursiveBuilder = ({ dslString, onChange, color }: { dslString: string, onChange: (newDsl: string) => void, color: string }) => {
  let rootNode: any;
  try {
    rootNode = JSON.parse(dslString);
    if (!rootNode || !rootNode.operator) throw new Error();
  } catch (e) {
    return <div style={{ color: '#ef4444' }}>Invalid JSON in DSL editor. Please fix the JSON first.</div>;
  }

  const handleChange = (path: number[], updater: (n: any) => any) => {
    const updated = updateNodeInTree(rootNode, path, updater);
    onChange(JSON.stringify(updated, null, 2));
  };

  const handleDelete = (path: number[]) => {
    const updated = deleteNodeInTree(rootNode, path);
    if (updated) onChange(JSON.stringify(updated, null, 2));
  };

  const handleAdd = (path: number[], newNode: any) => {
    const updated = addNodeInTree(rootNode, path, newNode);
    onChange(JSON.stringify(updated, null, 2));
  };

  const renderNode = (node: any, path: number[]): any => {
    if (node.operator && Array.isArray(node.conditions)) {
      return (
        <div key={path.join('-')} style={{ padding: '12px', marginLeft: path.length ? '15px' : '0', borderLeft: `3px solid ${color}`, background: 'var(--s-surface)', borderRadius: '0 8px 8px 0', marginBottom: '8px', borderTop: '1px solid var(--s-border-md)', borderRight: '1px solid var(--s-border-md)', borderBottom: '1px solid var(--s-border-md)' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
            <select className="pb-select" style={{ padding: '2px 8px', fontWeight: 'bold' }} value={node.operator} onChange={e => handleChange(path, n => ({ ...n, operator: e.target.value }))}>
              <option value="AND">AND GROUP</option>
              <option value="OR">OR GROUP</option>
            </select>
            <button className="pb-btn" style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--s-card-hover)' }} onClick={() => handleAdd(path, { indicator: 'EMA', params: { period: 20 }, comparison: '>', value: 0 })}>+ Condition</button>
            <button className="pb-btn" style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--s-card-hover)' }} onClick={() => handleAdd(path, { operator: 'AND', conditions: [] })}>+ Group</button>
            {path.length > 0 && <button className="pb-btn" style={{ padding: '2px 8px', fontSize: '11px', background: 'var(--s-red-dim)', color: 'var(--s-red)' }} onClick={() => handleDelete(path)}>Delete Group</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {node.conditions.map((child: any, i: number) => renderNode(child, [...path, i]))}
          </div>
        </div>
      );
    } else {
      const isValNum = typeof node.value === 'number';
      return (
        <div key={path.join('-')} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', background: 'var(--s-card)', padding: '8px', borderRadius: '6px', border: '1px solid var(--s-border-md)' }}>
          <select className="pb-select" style={{ padding: '2px 6px' }} value={node.indicator} onChange={e => handleChange(path, n => ({ ...n, indicator: e.target.value }))}>
            <option value="EMA">EMA</option><option value="SMA">SMA</option><option value="RSI">RSI</option><option value="MACD">MACD</option><option value="BOLLINGER">BOLLINGER</option><option value="OBI">OBI</option><option value="Close">Close</option>
          </select>
          
          {node.indicator !== 'Close' && node.indicator !== 'OBI' && (
            <input type="number" className="pb-input" style={{ width: '50px', padding: '2px 6px' }} value={node.params?.period || node.params?.fast || 20} onChange={e => handleChange(path, n => ({ ...n, params: { ...n.params, period: Number(e.target.value) } }))} placeholder="Param" />
          )}

          <select className="pb-select" style={{ padding: '2px 6px' }} value={node.comparison} onChange={e => handleChange(path, n => ({ ...n, comparison: e.target.value }))}>
            <option value=">">&gt;</option><option value="<">&lt;</option><option value="==">==</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option>
          </select>

          <select className="pb-select" style={{ padding: '2px 6px' }} value={isValNum ? 'Number' : 'Indicator'} onChange={e => handleChange(path, n => ({ ...n, value: e.target.value === 'Number' ? 0 : { indicator: 'EMA', params: { period: 50 } } }))}>
            <option value="Number">Number</option><option value="Indicator">Indicator</option>
          </select>

          {isValNum ? (
            <input type="number" className="pb-input" style={{ width: '60px', padding: '2px 6px' }} value={node.value} onChange={e => handleChange(path, n => ({ ...n, value: Number(e.target.value) }))} />
          ) : (
            <>
              <select className="pb-select" style={{ padding: '2px 6px' }} value={node.value?.indicator || 'EMA'} onChange={e => handleChange(path, n => ({ ...n, value: { ...n.value, indicator: e.target.value } }))}>
                <option value="EMA">EMA</option><option value="SMA">SMA</option><option value="RSI">RSI</option><option value="MACD">MACD</option><option value="BOLLINGER">BOLLINGER</option><option value="OBI">OBI</option><option value="Close">Close</option>
              </select>
              {node.value?.indicator !== 'Close' && node.value?.indicator !== 'OBI' && (
                <input type="number" className="pb-input" style={{ width: '50px', padding: '2px 6px' }} value={node.value?.params?.period || 50} onChange={e => handleChange(path, n => ({ ...n, value: { ...n.value, params: { ...n.value?.params, period: Number(e.target.value) } } }))} placeholder="Param" />
              )}
            </>
          )}
          
          <button className="pb-btn" style={{ padding: '2px 8px', marginLeft: 'auto', background: '#fef2f2', color: '#ef4444' }} onClick={() => handleDelete(path)}>X</button>
        </div>
      );
    }
  };

  return <div>{renderNode(rootNode, [])}</div>;
};
