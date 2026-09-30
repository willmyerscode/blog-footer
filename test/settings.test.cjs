const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolveSettings,sourceURL} = require('../blog-footer.js');
const context = {pathname:'/blog/post',categories:['Recipe','News'],tags:['Winter','Drink']};
test('each later group changes only supplied fields',()=>{
 const result=resolveSettings({defaults:{source:'/default'},categories:{Recipe:{disabled:true}},tags:{Drink:{source:'/drink'}},urls:{'/blog/post':{disabled:false}}},context);
 assert.equal(result.source,'/drink');assert.equal(result.disabled,false);
 assert.deepEqual(result.matched,['defaults','categories: Recipe','tags: Drink','urls: /blog/post']);
});
test('source alone does not re-enable a disabled footer',()=>assert.equal(resolveSettings({defaults:{disabled:true},tags:{Drink:{source:'/drink'}}},context).disabled,true));
test('last written matching category wins; unmatched rule has no effect',()=>assert.equal(resolveSettings({categories:{News:{source:'/news'},Recipe:{source:'/recipe'},Other:{source:'/other'}}},context).source,'/recipe'));
test('last written matching tag wins independently of post label order',()=>assert.equal(resolveSettings({tags:{Drink:{source:'/drink'},Winter:{source:'/winter'}}},context).source,'/winter'));
test('URL wins; paths are exact with an optional trailing slash',()=>{
 const config={defaults:{source:'/default'},urls:{'/blog':{source:'/wrong'},'/blog/post/':{source:'/exact'},'/blog/post?x=1':{source:'/wrong'}}};
 assert.equal(resolveSettings(config,context).source,'/exact');
 assert.equal(resolveSettings(config,{...context,pathname:'/blog/post-more'}).source,'/default');
});
test('missing and invalid optional rules keep defaults',()=>{
 assert.deepEqual(resolveSettings(null,context),{source:'',disabled:false,matched:[]});
 const result=resolveSettings({defaults:{source:'/default'},categories:[],tags:{Drink:{source:3,disabled:'true'}},urls:null},context);
 assert.equal(result.source,'/default');assert.equal(result.disabled,false);
});
test('names trim surrounding spaces but keep case',()=>{
 assert.equal(resolveSettings({categories:{' Recipe ':{source:'/yes'},recipe:{source:'/no'}}},context).source,'/yes');
});
test('only same-site sources are accepted; current page cannot load itself',()=>{
 const current='https://example.com/blog/post?x=1';
 for(const source of ['',null,'https://other.com/footer','//other.com/footer','javascript:alert(1)','https://user:pass@example.com/footer','/blog/post/']) assert.equal(sourceURL(source,current),null);
 assert.equal(sourceURL('/footer#section',current),'https://example.com/footer');
 assert.equal(sourceURL('https://example.com/footer',current),'https://example.com/footer');
});
