import React, { useState } from 'react';
import { CardList, Pagination, Dialog, Button } from '@form-engine/studio-design-components';
import { MaterialCard } from '../../../../apps/studio/src/app/material-card';
import docs from '../../../materials-react/catalog-docs.json';
import '../../../materials-react/src/styles.css';
import { materialIds } from './card-list-materials.mjs';

const assets = materialIds.map((id) => ({ ...docs[id], id, version: '0.1.0' }));

function Cards({ empty, label, emptyText }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);
  const [selected, setSelected] = useState(null);
  const [reference, setReference] = useState(null);
  const items = empty ? [] : assets;
  return (
    <section className="card-list-example">
      <h3>{label}</h3>
      <CardList
        label={label}
        items={items.slice((page - 1) * pageSize, page * pageSize)}
        itemKey={(asset) => asset.id}
        empty={emptyText}
        renderItem={(asset) => (
          <MaterialCard
            asset={asset}
            detailsAction
            onOpen={() => setSelected(asset)}
            onReference={() => setReference(asset)}
          />
        )}
      />
      {reference && (
        <p role="status">
          已添加引用：{reference.title} · v{reference.version}
        </p>
      )}
      <Pagination
        page={empty ? 1 : page}
        pageSize={pageSize}
        total={items.length}
        pageSizeOptions={[3, 5, 10]}
        onChange={(nextPage, nextSize) => {
          setPage(nextPage);
          setPageSize(nextSize);
        }}
      />
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Viewport>
            <Dialog.Popup>
              <Dialog.Title>{selected?.title}</Dialog.Title>
              <Dialog.Description>{selected?.summary}</Dialog.Description>
              <Dialog.Close render={<Button />}>关闭</Dialog.Close>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

export const cardListStory = [Cards, { label: '物料目录', empty: false, emptyText: '暂无物料' }];
