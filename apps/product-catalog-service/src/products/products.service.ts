import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '@app/contracts';
import { CreateProductDto } from './dtos/create-product.dto.js';
import { UpdateProductDto } from './dtos/update-product.dto.js';

@Injectable()
export class ProductsService {
  private readonly products: Product[] = [
    { id: 1, name: 'Sample Product', price: 9.99 },
    { id: 2, name: 'Keyboard', price: 49.99 },
    { id: 3, name: 'Mouse', price: 19.99 },
  ];

  findAll(): Product[] {
    return this.products;
  }

  findOne(id: number): Product {
    const product = this.products.find((product) => product.id === id);

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    return product;
  }

  create(createProductDto: CreateProductDto): Product {
    const product: Product = {
      id: this.products.length + 1,
      ...createProductDto,
    };

    this.products.push(product);

    return product;
  }

  update(id: number, updateProductDto: UpdateProductDto): Product {
    const product = this.findOne(id);

    Object.assign(product, updateProductDto);

    return product;
  }

  remove(id: number): void {
    const product = this.findOne(id);

    this.products.splice(this.products.indexOf(product), 1);
  }

}
